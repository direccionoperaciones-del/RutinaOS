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
      throw new Error('Variables de entorno del servidor no configuradas.')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta cabecera de autorización.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let triggeredBy = 'unknown';
    let requesterTenantId: string | null = null;
    const token = authHeader.replace('Bearer ', '');

    // Identificar origen (Cron o Manual)
    if (token === supabaseServiceKey) {
      triggeredBy = 'cron';
    } else {
      const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
      
      if (authErr || !user) {
        return new Response(JSON.stringify({ ok: false, error: 'Token inválido.' }), { status: 401, headers: corsHeaders })
      }

      const { data: profile } = await supabaseAuth.from('profiles').select('role, tenant_id').eq('id', user.id).single();
      
      if (profile?.role === 'director') {
        triggeredBy = `manual_${user.email}`;
        requesterTenantId = profile.tenant_id;
      } else {
        return new Response(JSON.stringify({ ok: false, error: 'Permiso denegado.' }), { status: 403, headers: corsHeaders })
      }
    }

    // Body parsing
    let body = {};
    try { body = await req.json(); } catch (e) {}
    
    const manualDate = (body as any).date;
    const force = (body as any).force || false;

    // Fecha objetivo (Hoy Colombia por defecto)
    const now = new Date();
    const colombiaOffset = -5 * 60 * 60 * 1000;
    const nowColombia = new Date(now.getTime() + colombiaOffset);
    const targetDate = manualDate || nowColombia.toISOString().split('T')[0];

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Logs de inicio
    let runRecordId = null;
    if (!requesterTenantId) {
      const { data: runRecord } = await supabaseAdmin.from('task_generation_runs').upsert({
          fecha: targetDate,
          status: 'running',
          started_at: new Date().toISOString(),
          triggered_by: triggeredBy
        }, { onConflict: 'fecha' }).select().single();
      if (runRecord) runRecordId = runRecord.id;
    }

    // --- LÓGICA DE GENERACIÓN ---
    let tenantQuery = supabaseAdmin.from('tenants').select('id').eq('activo', true);
    if (requesterTenantId) tenantQuery = tenantQuery.eq('id', requesterTenantId);
    const { data: tenants } = await tenantQuery;
    
    const [y, m, d] = targetDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay(); // 0=Dom
    const dayOfMonth = dateObj.getUTCDate();

    let totalTasksCreated = 0;
    const logs: string[] = [];

    for (const tenant of (tenants || [])) {
      // 1. Asignaciones
      const { data: assignments } = await supabaseAdmin.from('routine_assignments')
        .select(`id, pdv_id, rutina_id, routine_templates (id, frequency:frecuencia, days:dias_ejecucion, active:activo, priority:prioridad, start:hora_inicio, limit:hora_limite, dates:fechas_especificas, dom:vencimiento_dia_mes)`)
        .eq('tenant_id', tenant.id).eq('estado', 'activa');

      // 2. Responsables
      const { data: responsibles } = await supabaseAdmin.from('pdv_assignments')
        .select('pdv_id, user_id').eq('tenant_id', tenant.id).eq('vigente', true);
      const respMap = new Map();
      responsibles?.forEach(r => respMap.set(r.pdv_id, r.user_id));

      // 3. Ausencias
      const { data: absences } = await supabaseAdmin.from('user_absences')
        .select('user_id, politica, receptor_id').eq('tenant_id', tenant.id).lte('fecha_desde', targetDate).gte('fecha_hasta', targetDate);
      const absMap = new Map();
      absences?.forEach(a => absMap.set(a.user_id, a));

      const tasksToInsert = [];

      for (const assign of (assignments || [])) {
        const r = assign.routine_templates;
        if (!r || !r.active) continue;

        let shouldRun = false;
        if (r.frequency === 'diaria') {
           if (!r.days || r.days.length === 0 || r.days.includes(dayOfWeek)) shouldRun = true;
        }
        else if (r.frequency === 'semanal' && r.days?.includes(dayOfWeek)) shouldRun = true;
        else if (r.frequency === 'mensual' && dayOfMonth === 1) shouldRun = true;
        else if (r.frequency === 'quincenal' && (dayOfMonth === 1 || dayOfMonth === 16)) shouldRun = true;
        else if (r.frequency === 'fechas_especificas' && r.dates?.includes(targetDate)) shouldRun = true;

        if (!shouldRun) continue;

        let userId = respMap.get(assign.pdv_id);
        if (!userId) continue; 

        const absence = absMap.get(userId);
        if (absence) {
          if (absence.politica === 'omitir') continue;
          if (absence.politica === 'reasignar' && absence.receptor_id) userId = absence.receptor_id;
        }

        tasksToInsert.push({
          tenant_id: tenant.id,
          assignment_id: assign.id,
          rutina_id: assign.rutina_id,
          pdv_id: assign.pdv_id,
          responsable_id: userId,
          fecha_programada: targetDate,
          estado: 'pendiente',
          prioridad_snapshot: r.priority,
          hora_inicio_snapshot: r.start,
          hora_limite_snapshot: r.limit,
          created_at: new Date().toISOString()
        });
      }

      if (tasksToInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('task_instances').upsert(tasksToInsert, { onConflict: 'assignment_id,fecha_programada', ignoreDuplicates: true });
        if (insertError) logs.push(`Tenant ${tenant.id}: ${insertError.message}`);
        else totalTasksCreated += tasksToInsert.length;
      }
    }

    if (runRecordId) {
      await supabaseAdmin.from('task_generation_runs').update({
          status: 'success', finished_at: new Date().toISOString(), tasks_created: totalTasksCreated, error_message: logs.length > 0 ? logs.join('; ') : null
      }).eq('id', runRecordId);
    }

    return new Response(JSON.stringify({ ok: true, generated: totalTasksCreated, date: targetDate }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})