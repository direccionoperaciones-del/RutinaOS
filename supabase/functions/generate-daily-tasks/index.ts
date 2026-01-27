import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 0. Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. ENVIRONMENT CHECK
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('CONFIG_ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // Cliente Admin (Bypass RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 2. AUTHENTICATION & PAYLOAD
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, code: "AUTH_MISSING", message: "No Authorization header" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    let triggerSource = 'unknown'
    let tenantIdArg = null

    // Caso A: Service Key (Cron)
    if (token === supabaseServiceKey) {
      triggerSource = 'cron'
    } 
    // Caso B: User (JWT)
    else {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      
      if (authError || !user) {
        console.error("❌ Auth Error:", authError?.message)
        return new Response(
          JSON.stringify({ 
            ok: false, 
            code: "AUTH_INVALID", 
            message: `Invalid Token: ${authError?.message || 'User not found'}` 
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      triggerSource = user.id
      
      // Obtener tenant del usuario
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      
      if (profile) tenantIdArg = profile.tenant_id
    }

    // 3. PARSE & VALIDATE DATE
    const body = await req.json().catch(() => ({}))
    let { date } = body

    // Default a Fecha Colombia si no viene
    if (!date) {
      const now = new Date()
      // Ajuste manual UTC-5 para Colombia
      const offsetMs = -5 * 60 * 60 * 1000
      const nowCol = new Date(now.getTime() + offsetMs)
      date = nowCol.toISOString().split('T')[0]
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({ ok: false, code: "VALIDATION_ERROR", message: "Invalid date format. Use YYYY-MM-DD" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Motor] Iniciando para fecha: ${date} | Source: ${triggerSource} | TenantFilter: ${tenantIdArg || 'ALL'}`)

    // Obtener Tenants a procesar
    let tenantsQuery = supabaseAdmin.from('tenants').select('id')
    if (tenantIdArg) {
      tenantsQuery = tenantsQuery.eq('id', tenantIdArg)
    } else {
      tenantsQuery = tenantsQuery.eq('activo', true)
    }

    const { data: tenants, error: tenantsError } = await tenantsQuery
    if (tenantsError) throw new Error(`DB Error fetching tenants: ${tenantsError.message}`)

    let totalGenerated = 0
    let totalSkipped = 0 // Aproximado

    // Procesar cada Tenant
    for (const tenant of (tenants || [])) {
      const tId = tenant.id

      // 4.1 Obtener Datos Maestros del Tenant (Assignments, Responsables, Ausencias)
      const [assignmentsResult, responsiblesResult, absencesResult] = await Promise.all([
        supabaseAdmin.from('routine_assignments')
          .select(`
            id, pdv_id, rutina_id,
            routine_templates (
              id, frecuencia, dias_ejecucion, prioridad, hora_inicio, hora_limite,
              fechas_especificas, vencimiento_dia_mes, corte_1_limite, corte_2_limite, activo
            )
          `)
          .eq('tenant_id', tId)
          .eq('estado', 'activa')
          .eq('routine_templates.activo', true),
        
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

      const assignments = assignmentsResult.data || []
      
      const respMap = new Map()
      responsiblesResult.data?.forEach(r => respMap.set(r.pdv_id, r.user_id))
      
      const absMap = new Map()
      absencesResult.data?.forEach(a => absMap.set(a.user_id, a))

      // 4.2 Filtrar y Construir Tareas
      const tasksToInsert = []
      
      // Fecha Helper (Usar UTC de la fecha string para evitar desfases locales)
      const [y, m, d] = date.split('-').map(Number)
      const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)) // Mediodía UTC
      const dayOfWeek = dateObj.getUTCDay() // 0-6
      const dayOfMonth = dateObj.getUTCDate()

      for (const assign of assignments) {
        const r = assign.routine_templates
        if (!r) continue

        // Check Frecuencia
        let shouldRun = false
        switch (r.frecuencia) {
          case 'diaria':
            if (!r.dias_ejecucion?.length || r.dias_ejecucion.includes(dayOfWeek)) shouldRun = true
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

        if (!shouldRun) continue

        // Check Responsable
        let userId = respMap.get(assign.pdv_id)
        if (!userId) continue 

        // Check Ausencias
        const absence = absMap.get(userId)
        if (absence) {
          if (absence.politica === 'omitir') continue
          if (absence.politica === 'reasignar' && absence.receptor_id) userId = absence.receptor_id
        }

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

      // 4.3 Escritura Idempotente (UPSERT con ignoreDuplicates)
      if (tasksToInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('task_instances')
          .upsert(tasksToInsert, { 
            onConflict: 'assignment_id,fecha_programada', 
            ignoreDuplicates: true
          })
        
        if (insertError) {
          console.error(`Error inserting tasks for tenant ${tId}:`, insertError)
        } else {
          totalGenerated += tasksToInsert.length
        }
      }
    }

    // 5. SUCCESS RESPONSE
    return new Response(
      JSON.stringify({
        ok: true,
        generated: totalGenerated,
        skipped: totalSkipped,
        date: date,
        message: `Proceso completado. ${totalGenerated} tareas procesadas.`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error("❌ FATAL EDGE ERROR:", err)
    return new Response(
      JSON.stringify({ 
        ok: false, 
        code: "INTERNAL_ERROR", 
        message: err.message, 
        stack: err.stack 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})