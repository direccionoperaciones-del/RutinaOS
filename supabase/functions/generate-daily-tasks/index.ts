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
    // 1. SETUP CLIENTE
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('CONFIG_ERROR: Missing Env Variables')
    }

    // 2. AUTH CHECK
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, code: "AUTH_MISSING", message: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    let tenantIdArg = null
    let requestUserEmail = 'cron'

    if (token !== supabaseServiceKey) {
      const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } })
      const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()

      if (authError || !user) {
        return new Response(JSON.stringify({ ok: false, code: "AUTH_INVALID", message: "Invalid Token" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      
      requestUserEmail = user.email || 'unknown'
      const { data: profile } = await supabaseAdmin.from('profiles').select('tenant_id, role').eq('id', user.id).single()
      
      if (!profile || !['director', 'lider', 'administrador'].includes(profile.role)) {
         return new Response(JSON.stringify({ ok: false, code: "FORBIDDEN", message: "Insufficient permissions" }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      tenantIdArg = profile.tenant_id
    }

    // 3. DATE PARSING
    const body = await req.json().catch(() => ({}))
    let { date } = body

    if (!date) {
      const now = new Date()
      const offsetMs = -5 * 60 * 60 * 1000 // UTC-5 Colombia
      const nowCol = new Date(now.getTime() + offsetMs)
      date = nowCol.toISOString().split('T')[0]
    }

    // Calcular datos de fecha
    const [y, m, d] = date.split('-').map(Number)
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    const dayOfWeek = dateObj.getUTCDay() // 0=Dom, 1=Lun...
    const dayOfMonth = dateObj.getUTCDate()

    console.log(`[Motor] Procesando ${date} (DiaSemana: ${dayOfWeek}, DiaMes: ${dayOfMonth}) para Tenant: ${tenantIdArg || 'ALL'}`)

    // 4. LÓGICA DE GENERACIÓN
    let tenantsQuery = supabaseAdmin.from('tenants').select('id')
    if (tenantIdArg) tenantsQuery = tenantsQuery.eq('id', tenantIdArg)
    else tenantsQuery = tenantsQuery.eq('activo', true)

    const { data: tenants } = await tenantsQuery
    
    let totalGenerated = 0
    let totalAssignmentsFound = 0
    
    // Diagnóstico
    const logs: string[] = []
    const summary = {
      assignments_found: 0,
      skipped_wrong_day: 0,
      skipped_no_responsible: 0,
      skipped_absence: 0,
      skipped_inactive_routine: 0
    }

    for (const tenant of (tenants || [])) {
      const tId = tenant.id

      // Fetch Data
      const [assignmentsRes, responsiblesRes, absencesRes] = await Promise.all([
        supabaseAdmin.from('routine_assignments')
          .select(`
            id, pdv_id, rutina_id,
            pdv (nombre),
            routine_templates (
              id, nombre, frecuencia, dias_ejecucion, prioridad, hora_inicio, hora_limite,
              fechas_especificas, vencimiento_dia_mes, corte_1_limite, corte_2_limite, activo
            )
          `)
          .eq('tenant_id', tId)
          .eq('estado', 'activa'),
        
        supabaseAdmin.from('pdv_assignments')
          .select('pdv_id, user_id')
          .eq('tenant_id', tId)
          .eq('vigente', true),

        supabaseAdmin.from('user_absences')
          .select('user_id, politica, receptor_id')
          .eq('tenant_id', tId)
          .lte('fecha_desde', date)
          .gte('fecha_hasta', date)
      ])

      const assignments = assignmentsRes.data || []
      const respMap = new Map()
      responsiblesRes.data?.forEach(r => respMap.set(r.pdv_id, r.user_id))
      const absMap = new Map()
      absencesRes.data?.forEach(a => absMap.set(a.user_id, a))

      summary.assignments_found += assignments.length
      const tasksToInsert = []

      for (const assign of assignments) {
        const r = assign.routine_templates
        const pdvName = assign.pdv?.nombre || 'PDV?'
        const routineName = r?.nombre || 'Rutina?'

        // Validación 1: Rutina Activa
        if (!r || !r.activo) {
          summary.skipped_inactive_routine++
          continue
        }

        // Validación 2: Frecuencia (Día correcto)
        let shouldRun = false
        switch (r.frecuencia) {
          case 'diaria':
            if (!r.dias_ejecucion || r.dias_ejecucion.length === 0 || r.dias_ejecucion.includes(dayOfWeek)) shouldRun = true
            break
          case 'semanal':
            if (r.dias_ejecucion?.includes(dayOfWeek)) shouldRun = true
            break
          case 'mensual':
            if (dayOfMonth === 1) shouldRun = true
            break
          case 'quincenal':
            if (dayOfMonth === 1 || dayOfMonth === 16) shouldRun = true
            break
          case 'fechas_especificas':
            if (r.fechas_especificas?.includes(date)) shouldRun = true
            break
        }

        if (!shouldRun) {
          summary.skipped_wrong_day++
          continue
        }

        // Validación 3: Responsable
        let userId = respMap.get(assign.pdv_id)
        if (!userId) {
          summary.skipped_no_responsible++
          logs.push(`⚠️ Skip [${routineName} @ ${pdvName}]: PDV sin responsable vigente`)
          continue 
        }

        // Validación 4: Ausencias
        const absence = absMap.get(userId)
        if (absence) {
          if (absence.politica === 'omitir') {
            summary.skipped_absence++
            logs.push(`ℹ️ Skip [${routineName}]: Responsable ausente (Omitir)`)
            continue
          }
          if (absence.politica === 'reasignar' && absence.receptor_id) {
            userId = absence.receptor_id
          }
        }

        // TODO OK -> Agregar
        tasksToInsert.push({
          tenant_id: tId,
          assignment_id: assign.id,
          rutina_id: assign.rutina_id,
          pdv_id: assign.pdv_id,
          responsable_id: userId,
          fecha_programada: date,
          estado: 'pendiente',
          prioridad_snapshot: r.prioridad,
          hora_inicio_snapshot: r.hora_inicio,
          hora_limite_snapshot: r.hora_limite,
          created_at: new Date().toISOString()
        })
      }

      if (tasksToInsert.length > 0) {
        const { error, count } = await supabaseAdmin
          .from('task_instances')
          .upsert(tasksToInsert, { 
            onConflict: 'assignment_id,fecha_programada', 
            ignoreDuplicates: true,
            count: 'exact'
          })
        
        if (error) {
          // CRITICAL FIX: Reportar error de DB al frontend
          console.error("DB Insert Error:", error)
          logs.push(`❌ DB Error: ${error.message}. (Verificar constraint unique)`)
        } else {
          totalGenerated += tasksToInsert.length
        }
      }
    }

    const message = totalGenerated > 0 
      ? `Éxito. ${totalGenerated} tareas generadas.`
      : `Proceso completado. Ver detalles.`;

    return new Response(
      JSON.stringify({
        ok: true,
        generated: totalGenerated,
        date: date,
        message: message,
        diagnosis: {
          total_asignaciones: summary.assignments_found,
          razones_omitidas: {
            no_toca_hoy: summary.skipped_wrong_day,
            sin_responsable_pdv: summary.skipped_no_responsible,
            rutina_inactiva: summary.skipped_inactive_routine,
            ausencia_usuario: summary.skipped_absence
          },
          logs: logs.slice(0, 20)
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, code: "INTERNAL_ERROR", message: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})