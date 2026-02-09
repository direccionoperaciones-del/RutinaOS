import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Configuración del servidor incompleta.')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Auth & Trigger Info
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '');
    let triggeredBy = 'cron';
    
    if (token && token !== supabaseServiceKey) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) triggeredBy = `manual_${user.email}`;
    }

    // 2. Parse Body (Fecha y Tenant Objetivo)
    let body: any = {};
    try { const text = await req.text(); if (text) body = JSON.parse(text); } catch (e) {}
    
    let targetDate = body.date;
    const targetTenantId = body.tenant_id;

    if (!targetDate) {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'America/Bogota',
        year: 'numeric', month: '2-digit', day: '2-digit'
      });
      targetDate = formatter.format(now);
    }

    // Construir fecha segura para cálculos
    const [y, m, d] = targetDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay(); // 0=Dom
    const dayOfMonth = dateObj.getUTCDate();

    const logs: string[] = [];
    logs.push(`🚀 INICIO GENERACIÓN: ${targetDate}`);
    logs.push(`📅 Análisis: Día Mes=${dayOfMonth}, Día Sem=${dayOfWeek} (0=Dom)`);

    // 3. Obtener Tenants Activos
    let tenantQuery = supabaseAdmin.from('tenants').select('id, nombre').eq('activo', true);
    
    if (targetTenantId) {
      tenantQuery = tenantQuery.eq('id', targetTenantId);
      logs.push(`🎯 FILTRO APLICADO: Org ID ${targetTenantId}`);
    }

    const { data: tenants } = await tenantQuery;
    
    if (!tenants?.length) throw new Error("No hay organizaciones activas o no se encontró la solicitada.");

    let totalTasks = 0;

    for (const tenant of tenants) {
      logs.push(`🏢 ORG: ${tenant.nombre}`);

      // 4. Obtener Asignaciones de Rutinas
      const { data: routineAssigns } = await supabaseAdmin
        .from('routine_assignments')
        .select(`
          id, pdv_id, rutina_id,
          pdv (nombre),
          routine_templates (
            id, nombre, frecuencia, dias_ejecucion, activo, prioridad, 
            hora_inicio, hora_limite, fechas_especificas, vencimiento_dia_mes,
            corte_1_inicio, corte_2_inicio
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('estado', 'activa');

      if (!routineAssigns?.length) {
        logs.push(`   ℹ️ Sin rutinas asignadas.`);
        continue;
      }

      // 5. Obtener Responsables Vigentes
      const { data: pdvAssigns } = await supabaseAdmin
        .from('pdv_assignments')
        .select('pdv_id, user_id, fecha_desde, fecha_hasta')
        .eq('tenant_id', tenant.id)
        .eq('vigente', true)
        .lte('fecha_desde', targetDate); 

      const respMap = new Map();
      pdvAssigns?.forEach(a => {
        if (a.fecha_hasta && a.fecha_hasta < targetDate) return; 
        respMap.set(a.pdv_id, a.user_id);
      });

      // 6. Obtener Ausencias
      const { data: absences } = await supabaseAdmin
        .from('user_absences')
        .select('user_id, politica, receptor_id')
        .eq('tenant_id', tenant.id)
        .lte('fecha_desde', targetDate)
        .gte('fecha_hasta', targetDate);
      
      const absMap = new Map();
      absences?.forEach(a => absMap.set(a.user_id, a));

      // 7. Procesar Rutinas
      const tasksBatch: any[] = [];

      for (const assign of routineAssigns) {
        const r = assign.routine_templates;
        const pdvName = assign.pdv?.nombre || 'PDV Desconocido';

        if (!r) continue;
        if (!r.activo) {
           // logs.push(`   ⚪ Saltada ${r.nombre}: Rutina inactiva.`);
           continue;
        }

        // --- LÓGICA DE FRECUENCIA ---
        let shouldRun = false;
        let skipReason = "";
        
        if (r.frecuencia === 'diaria') {
          if (!r.dias_ejecucion || r.dias_ejecucion.length === 0 || r.dias_ejecucion.includes(dayOfWeek)) {
            shouldRun = true;
          } else {
            skipReason = `No toca hoy (Días: ${r.dias_ejecucion})`;
          }
        } else if (r.frecuencia === 'semanal') {
          if (r.dias_ejecucion?.includes(dayOfWeek)) shouldRun = true;
          else skipReason = `No toca hoy (Días: ${r.dias_ejecucion})`;
        } else if (r.frecuencia === 'mensual') {
          if (dayOfMonth === 1) shouldRun = true;
          else skipReason = `Mensual solo día 1`;
        } else if (r.frecuencia === 'quincenal') {
          const c1 = r.corte_1_inicio || 1;
          const c2 = r.corte_2_inicio || 16;
          if (dayOfMonth === c1 || dayOfMonth === c2) {
            shouldRun = true;
          } else {
            skipReason = `Hoy ${dayOfMonth} no es corte (${c1} o ${c2})`;
          }
        } else if (r.frecuencia === 'fechas_especificas') {
          if (r.fechas_especificas?.includes(targetDate)) shouldRun = true;
          else skipReason = `Fecha no listada en específicas`;
        }

        if (!shouldRun) {
          // Log solo para depuración profunda, descomentar si es necesario
          // logs.push(`   ⏭️ Saltada ${r.nombre}: ${skipReason}`);
          continue;
        }

        // --- VALIDAR RESPONSABLE ---
        let userId = respMap.get(assign.pdv_id);
        
        if (!userId) {
          logs.push(`   ⚠️ ${r.nombre} @ ${pdvName}: Sin responsable activo.`);
          continue;
        }

        // --- VALIDAR AUSENCIA ---
        const absence = absMap.get(userId);
        if (absence) {
          if (absence.politica === 'omitir') {
            logs.push(`   ⏸️ ${r.nombre} @ ${pdvName}: Responsable ausente (Omitir).`);
            continue;
          } else if (absence.politica === 'reasignar' && absence.receptor_id) {
            userId = absence.receptor_id;
            logs.push(`   🔄 ${r.nombre} @ ${pdvName}: Reasignado por ausencia.`);
          }
        }

        tasksBatch.push({
          tenant_id: tenant.id,
          assignment_id: assign.id,
          rutina_id: assign.rutina_id,
          pdv_id: assign.pdv_id,
          responsable_id: userId,
          fecha_programada: targetDate,
          estado: 'pendiente',
          prioridad_snapshot: r.prioridad,
          hora_inicio_snapshot: r.hora_inicio || '08:00:00',
          hora_limite_snapshot: r.hora_limite || '23:59:59',
          created_at: new Date().toISOString()
        });
      }

      if (tasksBatch.length > 0) {
        const { error: insError } = await supabaseAdmin
          .from('task_instances')
          .upsert(tasksBatch, { onConflict: 'assignment_id,fecha_programada', ignoreDuplicates: true });
        
        if (insError) {
          logs.push(`   ❌ Error BD: ${insError.message}`);
        } else {
          totalTasks += tasksBatch.length;
          logs.push(`   ✅ Creadas ${tasksBatch.length} tareas para ${tenant.nombre}.`);
        }
      } else {
        logs.push(`   ℹ️ Ninguna rutina cumplió criterios para hoy.`);
      }
    }

    // Log Run
    await supabaseAdmin.from('task_generation_runs').insert({
      fecha: targetDate,
      status: totalTasks > 0 ? 'success' : 'warning',
      tasks_created: totalTasks,
      triggered_by: triggeredBy,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: `Proceso finalizado. Tareas: ${totalTasks}`,
        generated: totalTasks,
        logs 
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})