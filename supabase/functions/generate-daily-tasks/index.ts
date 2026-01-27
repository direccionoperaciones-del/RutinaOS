import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Variables de Entorno Críticas
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Critical: Missing Env Variables")
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration: Missing Env Variables' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Cliente Admin (Bypasses RLS para operaciones del sistema)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // 1. AUTENTICACIÓN
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    let triggerSource = 'unknown'

    // Caso A: Cron Job (Service Key)
    if (token === supabaseServiceKey) {
      triggerSource = 'cron'
      console.log('🔒 Ejecución autorizada por Service Key (Cron)')
    } 
    // Caso B: Usuario Manual (JWT)
    else {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid User Token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Verificar Rol (Opcional, pero recomendado)
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
        
      if (!['director', 'lider', 'administrador'].includes(profile?.role)) {
         return new Response(
          JSON.stringify({ error: 'Forbidden: Insufficient permissions' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      triggerSource = user.id
      console.log(`👤 Ejecución manual por usuario: ${user.email}`)
    }

    // 2. PARSEO DE FECHA
    const { date } = await req.json().catch(() => ({ date: null }))
    
    // Obtener fecha objetivo (YYYY-MM-DD)
    let targetDateStr = date
    if (!targetDateStr) {
      // Si no viene fecha, usamos la fecha actual de Colombia (UTC-5)
      const now = new Date()
      const colombiaOffset = -5 * 60 // minutos
      const nowColombia = new Date(now.getTime() + (colombiaOffset * 60 * 1000))
      targetDateStr = nowColombia.toISOString().split('T')[0]
    }

    console.log(`📅 Iniciando generación para fecha: ${targetDateStr}`)

    // 3. REGISTRAR RUN (Idempotencia Lógica)
    // Verificamos si ya corrió exitosamente hoy (opcional, pero buena práctica)
    /*
    const { data: existingRun } = await supabaseAdmin
      .from('task_generation_runs')
      .select('*')
      .eq('fecha', targetDateStr)
      .eq('status', 'success')
      .maybeSingle()
    
    if (existingRun && triggerSource === 'cron') {
       console.log("⏭️ Tareas ya generadas para hoy. Saltando.")
       return new Response(
        JSON.stringify({ success: true, message: 'Tareas ya generadas previamente.', skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    */

    // 4. LÓGICA DE NEGOCIO: CARGAR DATOS
    
    // 4.1 Obtener Asignaciones Activas
    const { data: assignments, error: assignError } = await supabaseAdmin
      .from('routine_assignments')
      .select(`
        id, tenant_id, pdv_id, rutina_id,
        routine_templates (
          id, frecuencia, dias_ejecucion, prioridad, hora_inicio, hora_limite,
          fechas_especificas, vencimiento_dia_mes, corte_1_limite, corte_2_limite, activo
        )
      `)
      .eq('estado', 'activa')
      .eq('routine_templates.activo', true)

    if (assignError) throw new Error(`Error DB Assignments: ${assignError.message}`)

    // 4.2 Obtener Responsables Vigentes
    const { data: pdvResponsibles, error: pdvError } = await supabaseAdmin
      .from('pdv_assignments')
      .select('pdv_id, user_id')
      .eq('vigente', true)
    
    if (pdvError) throw new Error(`Error DB Responsibles: ${pdvError.message}`)
    
    const responsibleMap = new Map()
    pdvResponsibles?.forEach(p => responsibleMap.set(p.pdv_id, p.user_id))

    // 4.3 Obtener Ausencias
    const { data: absences, error: absError } = await supabaseAdmin
      .from('user_absences')
      .select('user_id, politica, receptor_id')
      .lte('fecha_desde', targetDateStr)
      .gte('fecha_hasta', targetDateStr)

    if (absError) throw new Error(`Error DB Absences: ${absError.message}`)
    
    const absenceMap = new Map()
    absences?.forEach(a => absenceMap.set(a.user_id, a))

    // 4.4 Obtener Excepciones
    const { data: exceptions, error: excError } = await supabaseAdmin
      .from('routine_assignment_exceptions')
      .select('assignment_id')
      .eq('fecha', targetDateStr)
    
    const exceptionSet = new Set(exceptions?.map(e => e.assignment_id))

    // 5. PROCESAMIENTO
    const tasksToInsert = []
    const logs = []
    const dayOfWeek = new Date(targetDateStr).getDay() // Ojo: new Date('2023-01-01') es UTC. getDay() devuelve dia UTC.
    // Ajuste seguro de día de la semana para evitar problemas de timezone
    // Creamos fecha con T12:00:00 para estar seguros en medio del día
    const dateObj = new Date(`${targetDateStr}T12:00:00`)
    const safeDayOfWeek = dateObj.getDay() // 0 = Domingo
    const safeDayOfMonth = dateObj.getDate()
    
    console.log(`Processing DayOfWeek: ${safeDayOfWeek}, DayOfMonth: ${safeDayOfMonth}`)

    for (const assignment of assignments) {
      if (exceptionSet.has(assignment.id)) continue;

      const rutina = assignment.routine_templates;
      if (!rutina) continue;

      let shouldGenerate = false;
      
      // Lógica de Frecuencia
      switch (rutina.frecuencia) {
        case 'diaria':
          // Si dias_ejecucion está vacío, asumimos todos los días, o verificamos inclusión
          if (!rutina.dias_ejecucion || rutina.dias_ejecucion.length === 0 || rutina.dias_ejecucion.includes(safeDayOfWeek)) {
            shouldGenerate = true;
          }
          break;
        case 'semanal':
          if (rutina.dias_ejecucion?.includes(safeDayOfWeek)) shouldGenerate = true;
          break;
        case 'mensual':
           if (safeDayOfMonth === 1) shouldGenerate = true; // Generar el día 1
           break;
        case 'quincenal':
           if (safeDayOfMonth === 1 || safeDayOfMonth === 16) shouldGenerate = true;
           break;
        case 'fechas_especificas':
           if (rutina.fechas_especificas?.includes(targetDateStr)) shouldGenerate = true;
           break;
      }

      if (!shouldGenerate) continue;

      // Resolver Responsable
      let responsibleId = responsibleMap.get(assignment.pdv_id);

      if (!responsibleId) {
        logs.push(`⚠️ PDV ${assignment.pdv_id} sin responsable. Tarea omitida.`);
        continue;
      }

      // Resolver Ausencias
      const absence = absenceMap.get(responsibleId);
      if (absence) {
        if (absence.politica === 'omitir') {
          continue; // Saltar tarea
        } else if (absence.politica === 'reasignar' && absence.receptor_id) {
          responsibleId = absence.receptor_id;
        }
      }

      tasksToInsert.push({
        tenant_id: assignment.tenant_id,
        assignment_id: assignment.id,
        rutina_id: assignment.rutina_id,
        pdv_id: assignment.pdv_id,
        responsable_id: responsibleId,
        fecha_programada: targetDateStr,
        estado: 'pendiente',
        prioridad_snapshot: rutina.prioridad,
        hora_inicio_snapshot: rutina.hora_inicio,
        hora_limite_snapshot: rutina.hora_limite,
        created_at: new Date().toISOString()
      });
    }

    // 6. ESCRITURA EN LOTE (UPSERT)
    // Usamos UPSERT con ignoreDuplicates para garantizar idempotencia
    // Requiere índice único en (assignment_id, fecha_programada)
    if (tasksToInsert.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('task_instances')
        .upsert(tasksToInsert, { 
          onConflict: 'assignment_id,fecha_programada',
          ignoreDuplicates: true 
        })
      
      if (upsertError) throw new Error(`Error Insertando Tareas: ${upsertError.message}`)
    }

    // 7. REGISTRAR RESULTADO
    await supabaseAdmin.from('task_generation_runs').insert({
        fecha: targetDateStr,
        status: 'success',
        tasks_created: tasksToInsert.length,
        finished_at: new Date().toISOString(),
        triggered_by: triggerSource
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Proceso finalizado. ${tasksToInsert.length} tareas procesadas para el ${targetDateStr}.`,
        details: { generated: tasksToInsert.length }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("❌ CRITICAL ERROR:", error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown server error',
        stack: error.stack 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})