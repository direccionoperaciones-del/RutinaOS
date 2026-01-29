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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const body = await req.json().catch(() => ({}))
    const triggeredBy = body.triggered_by || 'manual';
    const force = body.force || false; // Para reintentar manualmente si falló

    // 1. CALCULAR "HOY" EN ZONA HORARIA DE OPERACIÓN (Colombia GMT-5)
    // Esto es crítico para que el Cron (UTC) calcule bien el día
    const now = new Date();
    const colombiaOffset = -5 * 60 * 60 * 1000;
    const nowColombia = new Date(now.getTime() + colombiaOffset);
    const targetDate = body.date || nowColombia.toISOString().split('T')[0];

    console.log(`[Job] Iniciando para fecha: ${targetDate}. Trigger: ${triggeredBy}`);

    // 2. IDEMPOTENCIA: Verificar si ya existe una corrida exitosa para hoy
    if (!force) {
      const { data: existingRun } = await supabaseAdmin
        .from('task_generation_runs')
        .select('*')
        .eq('fecha', targetDate)
        .maybeSingle();

      if (existingRun && existingRun.status === 'success') {
        console.log(`[Job] Skip: Ya existe ejecución exitosa para ${targetDate}`);
        return new Response(
          JSON.stringify({ 
            ok: true, 
            skipped: true, 
            message: `Ya se generaron las tareas del ${targetDate} previamente.` 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. REGISTRAR INICIO (Running)
    // Usamos upsert para manejar reintentos sobre el mismo día
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

    if (runError) throw new Error(`Error iniciando log de corrida: ${runError.message}`);

    // --- LÓGICA CORE DE GENERACIÓN ---
    
    // Obtener tenants activos
    const { data: tenants } = await supabaseAdmin.from('tenants').select('id').eq('activo', true);
    
    // Calcular datos de fecha para las reglas
    const [y, m, d] = targetDate.split('-').map(Number);
    // Usamos UTC para evitar desplazamientos raros al extraer componentes
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay(); // 0=Dom
    const dayOfMonth = dateObj.getUTCDate();

    let totalTasksCreated = 0;
    const logs: string[] = [];

    for (const tenant of (tenants || [])) {
      // Obtener asignaciones activas
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

      // Obtener responsables vigentes
      const { data: responsibles } = await supabaseAdmin.from('pdv_assignments')
        .select('pdv_id, user_id')
        .eq('tenant_id', tenant.id)
        .eq('vigente', true);
        
      const respMap = new Map();
      responsibles?.forEach(r => respMap.set(r.pdv_id, r.user_id));

      // Obtener ausencias
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

        // Reglas de Frecuencia
        let shouldRun = false;
        if (r.frequency === 'diaria' && (!r.days || r.days.length === 0 || r.days.includes(dayOfWeek))) shouldRun = true;
        else if (r.frequency === 'semanal' && r.days?.includes(dayOfWeek)) shouldRun = true;
        else if (r.frequency === 'mensual' && dayOfMonth === 1) shouldRun = true; // Día 1
        else if (r.frequency === 'quincenal' && (dayOfMonth === 1 || dayOfMonth === 16)) shouldRun = true;
        else if (r.frequency === 'fechas_especificas' && r.dates?.includes(targetDate)) shouldRun = true;

        if (!shouldRun) continue;

        // Responsable y Ausencias
        let userId = respMap.get(assign.pdv_id);
        if (!userId) continue; // Sin responsable

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
        // Upsert tasks (si ya existen para ese assignment+fecha, no duplicar)
        const { error: insertError } = await supabaseAdmin
          .from('task_instances')
          .upsert(tasksToInsert, { onConflict: 'assignment_id,fecha_programada', ignoreDuplicates: true });
        
        if (insertError) {
          console.error(`Error insertando tareas tenant ${tenant.id}:`, insertError);
          logs.push(`Error tenant ${tenant.id}: ${insertError.message}`);
        } else {
          totalTasksCreated += tasksToInsert.length;
        }
      }
    }

    // 4. REGISTRAR FIN (Success)
    await supabaseAdmin
      .from('task_generation_runs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        tasks_created: totalTasksCreated,
        error_message: logs.length > 0 ? logs.join('; ') : null
      })
      .eq('id', runRecord.id);

    return new Response(
      JSON.stringify({ ok: true, generated: totalTasksCreated, date: targetDate }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error("[Job] Critical Fail:", err);
    
    // 5. REGISTRAR FALLO (Failed)
    // Intentamos actualizar el registro de corrida si existe, sino creamos uno de fallo
    try {
        const today = new Date().toISOString().split('T')[0]; // Fallback date if logic failed early
        await supabaseAdmin.from('task_generation_runs').upsert({
            fecha: today, // Best effort date
            status: 'failed',
            error_message: err.message,
            finished_at: new Date().toISOString()
        }, { onConflict: 'fecha' });
    } catch (e) { /* ignore db error in catch block */ }

    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})