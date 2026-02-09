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

    // 2. Parse Body
    let body: any = {};
    try { const text = await req.text(); if (text) body = JSON.parse(text); } catch (e) {}
    
    let targetDate = body.date;
    const targetTenantId = body.tenant_id;

    if (!targetDate) {
      const now = new Date();
      // Ajuste a hora Colombia para cron automático
      const formatter = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'America/Bogota',
        year: 'numeric', month: '2-digit', day: '2-digit'
      });
      targetDate = formatter.format(now);
    }

    // Análisis de fecha
    const [y, m, d] = targetDate.split('-').map(Number);
    // Usamos UTC para asegurar que el día no cambie por timezone del servidor
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay(); // 0=Dom
    const dayOfMonth = dateObj.getUTCDate();

    const logs: string[] = [];
    logs.push(`🚀 INICIO: ${targetDate} (Día ${dayOfMonth})`);

    // 3. Obtener Tenants
    let tenantQuery = supabaseAdmin.from('tenants').select('id, nombre').eq('activo', true);
    if (targetTenantId) tenantQuery = tenantQuery.eq('id', targetTenantId);

    const { data: tenants } = await tenantQuery;
    if (!tenants?.length) throw new Error("Organización no encontrada o inactiva.");

    let totalTasks = 0;

    for (const tenant of tenants) {
      logs.push(`🏢 ORG: ${tenant.nombre}`);

      // 4. Asignaciones con Rutinas (JOIN)
      const { data: routineAssigns } = await supabaseAdmin
        .from('routine_assignments')
        .select(`
          id, pdv_id, rutina_id,
          pdv (nombre),
          routine_templates (
            id, nombre, frecuencia, dias_ejecucion, activo, 
            hora_inicio, hora_limite, fechas_especificas, vencimiento_dia_mes,
            corte_1_inicio, corte_2_inicio, prioridad
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('estado', 'activa');

      if (!routineAssigns?.length) {
        logs.push(`   ℹ️ No hay rutinas asignadas activas.`);
        continue;
      }

      // 5. Responsables y Ausencias
      const { data: pdvAssigns } = await supabaseAdmin
        .from('pdv_assignments')
        .select('pdv_id, user_id')
        .eq('tenant_id', tenant.id)
        .eq('vigente', true)
        .lte('fecha_desde', targetDate); 

      const respMap = new Map();
      pdvAssigns?.forEach(a => respMap.set(a.pdv_id, a.user_id));

      const { data: absences } = await supabaseAdmin
        .from('user_absences')
        .select('user_id, politica, receptor_id')
        .eq('tenant_id', tenant.id)
        .lte('fecha_desde', targetDate)
        .gte('fecha_hasta', targetDate);
      
      const absMap = new Map();
      absences?.forEach(a => absMap.set(a.user_id, a));

      // 6. Procesamiento
      const tasksBatch: any[] = [];

      for (const assign of routineAssigns) {
        const r = assign.routine_templates;
        const pdvName = assign.pdv?.nombre || 'PDV ???';

        if (!r || !r.activo) continue;

        let shouldRun = false;
        let details = "";

        // LÓGICA DE FRECUENCIA DETALLADA
        if (r.frecuencia === 'diaria') {
          const dias = r.dias_ejecucion || [];
          if (dias.length === 0 || dias.includes(dayOfWeek)) shouldRun = true;
          else details = `Día sem ${dayOfWeek} no está en [${dias}]`;
        } 
        else if (r.frecuencia === 'semanal') {
          const dias = r.dias_ejecucion || [];
          if (dias.includes(dayOfWeek)) shouldRun = true;
          else details = `Día sem ${dayOfWeek} no está en [${dias}]`;
        } 
        else if (r.frecuencia === 'quincenal') {
          // Asegurar conversión a número para evitar errores de tipo '3' !== 3
          const c1 = Number(r.corte_1_inicio) || 1;
          const c2 = Number(r.corte_2_inicio) || 16;
          
          if (dayOfMonth === c1 || dayOfMonth === c2) {
            shouldRun = true;
            details = `Corte coincidió (${dayOfMonth})`;
          } else {
            details = `Hoy ${dayOfMonth} != Cortes [${c1}, ${c2}]`;
          }
        } 
        else if (r.frecuencia === 'mensual') {
          if (dayOfMonth === 1) shouldRun = true;
          else details = `Mensual es solo el día 1`;
        } 
        else if (r.frecuencia === 'fechas_especificas') {
          if (r.fechas_especificas?.includes(targetDate)) shouldRun = true;
          else details = `Fecha no en lista específica`;
        }

        if (shouldRun) {
          // Validar Responsable
          let userId = respMap.get(assign.pdv_id);
          
          if (!userId) {
            logs.push(`   ⚠️ ${r.nombre} -> ${pdvName}: Sin responsable.`);
            continue;
          }

          // Validar Ausencia
          const absence = absMap.get(userId);
          if (absence) {
            if (absence.politica === 'omitir') {
              logs.push(`   ⏸️ ${r.nombre} -> ${pdvName}: Ausencia (Omitir).`);
              continue;
            } else if (absence.politica === 'reasignar' && absence.receptor_id) {
              userId = absence.receptor_id;
              logs.push(`   🔄 ${r.nombre} -> ${pdvName}: Reasignado.`);
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
          
          // Log de éxito en preparación
          // logs.push(`   ✅ ${r.nombre} -> ${pdvName}: Preparada.`);
        } else {
          // Log de diagnóstico para entender por qué NO corrió
          logs.push(`   ⛔ ${r.nombre}: ${details}`);
        }
      }

      if (tasksBatch.length > 0) {
        const { error: insError } = await supabaseAdmin
          .from('task_instances')
          .upsert(tasksBatch, { onConflict: 'assignment_id,fecha_programada', ignoreDuplicates: true });
        
        if (insError) logs.push(`   ❌ Error SQL: ${insError.message}`);
        else {
          totalTasks += tasksBatch.length;
          logs.push(`   ✅ INSERTADOS: ${tasksBatch.length} tareas.`);
        }
      }
    }

    await supabaseAdmin.from('task_generation_runs').insert({
      fecha: targetDate,
      status: totalTasks > 0 ? 'success' : 'warning',
      tasks_created: totalTasks,
      triggered_by: triggeredBy
    });

    return new Response(
      JSON.stringify({ ok: true, message: `Generadas: ${totalTasks}`, generated: totalTasks, logs }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})