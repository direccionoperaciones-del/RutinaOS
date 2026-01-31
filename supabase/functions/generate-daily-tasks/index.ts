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
      throw new Error('Configuración incompleta.')
    }

    // 1. Auth Check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Falta autorización.')

    const token = authHeader.replace('Bearer ', '');
    let triggeredBy = 'unknown';
    let requesterTenantId: string | null = null;

    if (token === supabaseServiceKey) {
      triggeredBy = 'cron';
    } else {
      const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user } } = await supabaseAuth.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabaseAuth.from('profiles').select('role, tenant_id').eq('id', user.id).single();
        if (profile?.role === 'director' || profile?.role === 'lider') {
          triggeredBy = `manual_${user.email}`;
          requesterTenantId = profile.tenant_id;
        } else {
          return new Response(JSON.stringify({ ok: false, error: 'Permiso denegado.' }), { status: 403, headers: corsHeaders })
        }
      }
    }

    // 2. Parse Body
    let body: any = {};
    try { 
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (e) {}
    
    const manualDate = body.date;
    const now = new Date();
    const colombiaOffset = -5 * 60 * 60 * 1000;
    const nowColombia = new Date(now.getTime() + colombiaOffset);
    const targetDate = manualDate || nowColombia.toISOString().split('T')[0];

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // --- LOGICA GENERACIÓN ---
    let tenantQuery = supabaseAdmin.from('tenants').select('id, nombre').eq('activo', true);
    if (requesterTenantId) tenantQuery = tenantQuery.eq('id', requesterTenantId);
    
    const { data: tenants } = await tenantQuery;
    if (!tenants || tenants.length === 0) throw new Error("No se encontraron organizaciones activas.");

    const [y, m, d] = targetDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay(); // 0=Dom
    const dayOfMonth = dateObj.getUTCDate();

    let totalTasksCreated = 0;
    const detailedLogs: string[] = [];

    detailedLogs.push(`📅 Fecha Objetivo: ${targetDate} (Día semana: ${dayOfWeek})`);

    for (const tenant of tenants) {
      detailedLogs.push(`🏢 Organización: ${tenant.nombre}`);

      // 1. Obtener Asignaciones de Rutinas
      const { data: assignments } = await supabaseAdmin
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

      if (!assignments || assignments.length === 0) {
        detailedLogs.push(`⚠️ Tenant ${tenant.nombre}: No hay rutinas asignadas.`);
        continue;
      }

      // 2. Obtener Responsables
      // CRITICO: Usamos 'profiles:user_id(...)' para decirle a Supabase explícitamente cuál Foreign Key usar
      const { data: responsibles, error: respError } = await supabaseAdmin
        .from('pdv_assignments')
        .select('pdv_id, user_id, profiles:user_id(nombre, apellido)') 
        .eq('tenant_id', tenant.id)
        .eq('vigente', true);
      
      if (respError) {
        // Loguear el error real pero intentar continuar
        detailedLogs.push(`🔥 Error consultando responsables: ${respError.message} (Code: ${respError.code})`);
      } else {
        detailedLogs.push(`ℹ️ Responsables activos encontrados: ${responsibles?.length || 0}`);
      }

      const respMap = new Map();
      responsibles?.forEach(r => respMap.set(r.pdv_id, r));

      // 3. Ausencias
      const { data: absences } = await supabaseAdmin
        .from('user_absences')
        .select('user_id, politica, receptor_id')
        .eq('tenant_id', tenant.id)
        .lte('fecha_desde', targetDate)
        .gte('fecha_hasta', targetDate);
      const absMap = new Map();
      absences?.forEach(a => absMap.set(a.user_id, a));

      const tasksToInsert: any[] = [];

      for (const assign of assignments) {
        const r = assign.routine_templates;
        const pdvName = assign.pdv?.nombre || 'PDV ???';
        
        if (!r || !r.activo) {
            continue;
        }

        // Frecuencia Check
        let shouldRun = false;
        let skipReason = "";

        if (r.frecuencia === 'diaria') {
           if (!r.dias_ejecucion || r.dias_ejecucion.length === 0 || r.dias_ejecucion.includes(dayOfWeek)) {
             shouldRun = true;
           } else {
             skipReason = `Día ${dayOfWeek} no programado.`;
           }
        }
        else if (r.frecuencia === 'semanal') {
           if (r.dias_ejecucion?.includes(dayOfWeek)) shouldRun = true;
           else skipReason = `Día ${dayOfWeek} no programado.`;
        }
        else if (r.frecuencia === 'mensual') {
           if (dayOfMonth === 1) shouldRun = true;
           else skipReason = `Solo día 1 (Hoy: ${dayOfMonth})`;
        }
        else if (r.frecuencia === 'quincenal') {
           const c1 = r.corte_1_inicio || 1;
           const c2 = r.corte_2_inicio || 16;
           if (dayOfMonth === c1 || dayOfMonth === c2) shouldRun = true;
           else skipReason = `Solo días ${c1} y ${c2}`;
        }
        else if (r.frecuencia === 'fechas_especificas') {
           if (r.fechas_especificas?.includes(targetDate)) shouldRun = true;
           else skipReason = `Fecha no listada.`;
        }

        if (!shouldRun) {
            // Solo loguear skips si es manual para no ensuciar
            if (triggeredBy !== 'cron') detailedLogs.push(`⏭️ Saltada: ${r.nombre} en ${pdvName} -> ${skipReason}`);
            continue;
        }

        // Check Responsable
        const assignmentInfo = respMap.get(assign.pdv_id);
        let userId = assignmentInfo?.user_id;
        
        if (!userId) {
          // Debugging info: Check if there's ANY assignment for this PDV, even inactive
          const { data: anyAssign } = await supabaseAdmin.from('pdv_assignments').select('id, vigente').eq('pdv_id', assign.pdv_id).limit(1);
          const status = anyAssign && anyAssign.length > 0 ? (anyAssign[0].vigente ? 'Activo (Error lectura)' : 'Inactivo') : 'Sin registro';
          
          detailedLogs.push(`⚠️ ${r.nombre} en ${pdvName}: SIN RESPONSABLE. (Estado BD: ${status})`);
          continue; 
        }

        // Check Absence
        const absence = absMap.get(userId);
        if (absence) {
          if (absence.politica === 'omitir') {
            detailedLogs.push(`⏸️ ${r.nombre}: Responsable ausente (Omitir).`);
            continue; 
          }
          if (absence.politica === 'reasignar' && absence.receptor_id) {
            userId = absence.receptor_id; 
            detailedLogs.push(`ℹ️ Reasignación por ausencia aplicada.`);
          }
        }

        tasksToInsert.push({
          tenant_id: tenant.id,
          assignment_id: assign.id,
          rutina_id: assign.rutina_id,
          pdv_id: assign.pdv_id,
          responsable_id: userId,
          fecha_programada: targetDate,
          estado: 'pendiente',
          prioridad_snapshot: r.prioridad,
          hora_inicio_snapshot: r.hora_inicio || '08:00',
          hora_limite_snapshot: r.hora_limite || '23:59',
          created_at: new Date().toISOString()
        });
        
        detailedLogs.push(`✅ Generar: ${r.nombre} para ${assignmentInfo?.profiles?.nombre || 'Usuario'} en ${pdvName}`);
      }

      if (tasksToInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('task_instances')
          .upsert(tasksToInsert, { onConflict: 'assignment_id,fecha_programada', ignoreDuplicates: true });
        
        if (insertError) {
          detailedLogs.push(`🔥 Error Insertando Tareas: ${insertError.message}`);
        } else {
          totalTasksCreated += tasksToInsert.length;
        }
      } else {
        if (assignments.length > 0) {
           detailedLogs.push(`ℹ️ Procesado sin tareas creadas (Ver motivos arriba).`);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: `Proceso finalizado. Creadas: ${totalTasksCreated}`,
        generated: totalTasksCreated, 
        date: targetDate,
        logs: detailedLogs 
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