import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Wrapper para garantizar respuesta JSON en caso de crash inesperado
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Variables de entorno del servidor no configuradas (SUPABASE_URL/KEY).')
    }

    // 1. AUTHENTICATION
    // La función puede ser llamada por Cron (Service Key) o por Director (User Token)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta cabecera de autorización.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let isAuthorized = false;
    let triggeredBy = 'unknown';
    let requesterTenantId: string | null = null;
    const token = authHeader.replace('Bearer ', '');

    // Caso A: Cron (Service Key)
    if (token === supabaseServiceKey) {
      isAuthorized = true;
      triggeredBy = 'cron';
    } else {
      // Caso B: Usuario (Director)
      const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
      
      if (authErr || !user) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Token de usuario inválido o expirado.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verificar rol y obtener tenant_id
      const { data: profile } = await supabaseAuth
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', user.id)
        .single();
      
      if (profile?.role === 'director') {
        isAuthorized = true;
        triggeredBy = `manual_${user.email}`;
        requesterTenantId = profile.tenant_id;
      } else {
        return new Response(
          JSON.stringify({ ok: false, error: 'Permiso denegado. Solo directores pueden ejecutar esta acción.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 2. PARSE BODY
    let body = {};
    try {
      body = await req.json();
    } catch (e) {
      // Si no hay body, usamos defaults
    }

    // 3. LOGIC
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Obtener fecha target
    const manualDate = (body as any).date;
    const force = (body as any).force || false;

    // Calcular hoy en Colombia si no se envió fecha
    const now = new Date();
    const colombiaOffset = -5 * 60 * 60 * 1000;
    const nowColombia = new Date(now.getTime() + colombiaOffset);
    const targetDate = manualDate || nowColombia.toISOString().split('T')[0];

    console.log(`[Job] Iniciando generación. Fecha: ${targetDate}, Trigger: ${triggeredBy}, Force: ${force}, Tenant: ${requesterTenantId || 'ALL'}`);

    // IDEMPOTENCIA (Solo para Cron o ejecuciones globales, manual forzado suele ignorarlo)
    if (!force && !requesterTenantId) {
      const { data: existingRun } = await supabaseAdmin
        .from('task_generation_runs')
        .select('*')
        .eq('fecha', targetDate)
        .maybeSingle();

      if (existingRun && existingRun.status === 'success') {
        return new Response(
          JSON.stringify({ 
            ok: true, 
            skipped: true, 
            message: `Tareas ya generadas para ${targetDate}. Use force=true para regenerar.` 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // REGISTRAR INICIO (Solo para CRON o si no hay log previo ese día, para no ensuciar logs con intentos manuales fallidos)
    let runRecordId = null;
    if (!requesterTenantId) {
      const { data: runRecord, error: runError } = await supabaseAdmin
        .from('task_generation_runs')
        .upsert({
          fecha: targetDate,
          status: 'running',
          started_at: new Date().toISOString(),
          triggered_by: triggeredBy,
          error_message: null
        }, { onConflict: 'fecha' })
        .select()
        .single();

      if (!runError) runRecordId = runRecord.id;
    }

    // --- CORE LOGIC START ---
    
    // Obtener tenants activos (filtrando si es ejecución manual)
    let tenantQuery = supabaseAdmin.from('tenants').select('id').eq('activo', true);
    
    if (requesterTenantId) {
      tenantQuery = tenantQuery.eq('id', requesterTenantId);
    }
    
    const { data: tenants } = await tenantQuery;
    
    // Configuración de fecha para reglas
    const [y, m, d] = targetDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay(); // 0=Dom
    const dayOfMonth = dateObj.getUTCDate();

    let totalTasksCreated = 0;
    const logs: string[] = [];

    for (const tenant of (tenants || [])) {
      // Asignaciones
      const { data: assignments } = await supabaseAdmin.from('routine_assignments')
        .select(`
          id, pdv_id, rutina_id,
          routine_templates (
            id, frequency:frecuencia, days:dias_ejecucion, active:activo,
            priority:prioridad, start:hora_inicio, limit:hora_limite,
            dates:fechas_especificas, dom:vencimiento_dia_mes
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('estado', 'activa');

      // Responsables
      const { data: responsibles } = await supabaseAdmin.from('pdv_assignments')
        .select('pdv_id, user_id')
        .eq('tenant_id', tenant.id)
        .eq('vigente', true);
        
      const respMap = new Map();
      responsibles?.forEach(r => respMap.set(r.pdv_id, r.user_id));

      // Ausencias
      const { data: absences } = await supabaseAdmin.from('user_absences')
        .select('user_id, politica, receptor_id')
        .eq('tenant_id', tenant.id)
        .lte('fecha_desde', targetDate)
        .gte('fecha_hasta', targetDate);
        
      const absMap = new Map();
      absences?.forEach(a => absMap.set(a.user_id, a));

      const tasksToInsert = [];

      for (const assign of (assignments || [])) {
        const r = assign.routine_templates;
        if (!r || !r.active) continue;

        // Reglas Frecuencia
        let shouldRun = false;
        if (r.frequency === 'diaria') {
           // Si days está vacío asumimos todos los días, o chequeamos lógica específica
           if (!r.days || r.days.length === 0 || r.days.includes(dayOfWeek)) shouldRun = true;
        }
        else if (r.frequency === 'semanal' && r.days?.includes(dayOfWeek)) shouldRun = true;
        else if (r.frequency === 'mensual' && dayOfMonth === 1) shouldRun = true;
        else if (r.frequency === 'quincenal' && (dayOfMonth === 1 || dayOfMonth === 16)) shouldRun = true;
        else if (r.frequency === 'fechas_especificas' && r.dates?.includes(targetDate)) shouldRun = true;

        if (!shouldRun) continue;

        // Validar Responsable
        let userId = respMap.get(assign.pdv_id);
        if (!userId) continue; 

        // Validar Ausencia
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
        const { error: insertError } = await supabaseAdmin
          .from('task_instances')
          .upsert(tasksToInsert, { onConflict: 'assignment_id,fecha_programada', ignoreDuplicates: true });
        
        if (insertError) {
          logs.push(`Tenant ${tenant.id}: ${insertError.message}`);
        } else {
          totalTasksCreated += tasksToInsert.length;
        }
      }
    }
    // --- CORE LOGIC END ---

    // REGISTRAR FIN (Si fue una ejecución global registrada)
    if (runRecordId) {
      await supabaseAdmin
        .from('task_generation_runs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          tasks_created: totalTasksCreated,
          error_message: logs.length > 0 ? logs.join('; ') : null
        })
        .eq('id', runRecordId);
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        generated: totalTasksCreated, 
        date: targetDate,
        logs: logs,
        scope: requesterTenantId ? 'single_tenant' : 'global'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error("[Job] Critical Fail:", error);
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message || 'Error interno desconocido',
        stack: error.stack 
      }),
      { 
        status: 500, // Devolvemos 500 pero CON BODY JSON
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})