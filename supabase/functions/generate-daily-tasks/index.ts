import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper para respuestas estandarizadas
const sendResponse = (status: number, body: any) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. VALIDACIÓN DE ENTORNO
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
      return sendResponse(500, { ok: false, code: "CONFIG_ERROR", message: "Server misconfiguration: Missing Env Variables" })
    }

    // Cliente con privilegios de Service Role (Bypass RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 2. AUTENTICACIÓN
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return sendResponse(401, { ok: false, code: "AUTH_MISSING", message: "Missing Authorization header" })
    }

    const token = authHeader.replace('Bearer ', '')
    let triggerSource = 'unknown'
    let tenantId = null

    // Caso A: Cron Job (Service Key)
    if (token === supabaseServiceKey) {
      triggerSource = 'cron'
      console.log('🔒 Ejecución autorizada por Service Key (Cron)')
    } 
    // Caso B: Usuario Manual (JWT)
    else {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (authError || !user) {
        return sendResponse(401, { ok: false, code: "AUTH_INVALID", message: "Invalid User Token" })
      }
      
      // Obtener perfil para Tenant
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', user.id)
        .single()
        
      if (!profile) {
        return sendResponse(403, { ok: false, code: "PROFILE_NOT_FOUND", message: "User profile not found" })
      }

      if (!['director', 'lider', 'administrador'].includes(profile.role)) {
         return sendResponse(403, { ok: false, code: "FORBIDDEN", message: "Insufficient permissions" })
      }
      
      triggerSource = user.id
      tenantId = profile.tenant_id
      console.log(`👤 Ejecución manual por: ${user.email} (Tenant: ${tenantId})`)
    }

    // 3. PARSEO Y VALIDACIÓN DE INPUT
    const body = await req.json().catch(() => ({}))
    let { date } = body
    
    // Si no viene fecha, usar fecha actual Colombia (UTC-5)
    if (!date) {
      const now = new Date()
      const colombiaOffset = -5 * 60 
      const nowColombia = new Date(now.getTime() + (colombiaOffset * 60 * 1000))
      date = nowColombia.toISOString().split('T')[0]
    }

    // Validar formato fecha YYYY-MM-DD simple
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return sendResponse(400, { ok: false, code: "INVALID_DATE", message: "Date must be YYYY-MM-DD" })
    }

    console.log(`📅 Procesando fecha: ${date} para Tenant: ${tenantId || 'ALL'}`)

    // 4. LÓGICA DE NEGOCIO
    // Si tenantId es null (CRON), iteramos sobre TODOS los tenants activos
    // Si tenantId existe (Manual), solo procesamos ese tenant.
    
    let tenantsQuery = supabaseAdmin.from('tenants').select('id')
    if (tenantId) {
      tenantsQuery = tenantsQuery.eq('id', tenantId)
    } else {
      tenantsQuery = tenantsQuery.eq('activo', true) // Solo tenants activos
    }
    
    const { data: tenants, error: tenantsError } = await tenantsQuery
    if (tenantsError) throw new Error(`Error fetching tenants: ${tenantsError.message}`)

    if (!tenants || tenants.length === 0) {
      return sendResponse(200, { ok: true, message: "No active tenants found to process.", generated: 0, skipped: 0 })
    }

    let totalGenerated = 0
    let totalSkipped = 0

    // Iterar por Tenant
    for (const tenant of tenants) {
      const tId = tenant.id
      
      // 4.1 Obtener Asignaciones Activas del Tenant
      const { data: assignments } = await supabaseAdmin
        .from('routine_assignments')
        .select(`
          id, pdv_id, rutina_id,
          routine_templates (
            id, frecuencia, dias_ejecucion, prioridad, hora_inicio, hora_limite,
            fechas_especificas, vencimiento_dia_mes, corte_1_limite, corte_2_limite, activo
          )
        `)
        .eq('tenant_id', tId)
        .eq('estado', 'activa')
        .eq('routine_templates.activo', true)

      if (!assignments || assignments.length === 0) continue

      // 4.2 Obtener Responsables Vigentes
      const { data: responsibles } = await supabaseAdmin
        .from('pdv_assignments')
        .select('pdv_id, user_id')
        .eq('tenant_id', tId)
        .eq('vigente', true)
      
      const respMap = new Map()
      responsibles?.forEach(r => respMap.set(r.pdv_id, r.user_id))

      // 4.3 Obtener Ausencias
      const { data: absences } = await supabaseAdmin
        .from('user_absences')
        .select('user_id, politica, receptor_id')
        .eq('tenant_id', tId)
        .lte('fecha_desde', date)
        .gte('fecha_hasta', date)
      
      const absMap = new Map()
      absences?.forEach(a => absMap.set(a.user_id, a))

      // 4.4 Procesar Asignaciones
      const tasksToInsert = []
      
      // Fecha helper
      const dateObj = new Date(`${date}T12:00:00`)
      const dayOfWeek = dateObj.getDay() // 0-6
      const dayOfMonth = dateObj.getDate()

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
        if (!userId) continue // Sin responsable, no generamos

        // Check Ausencias
        const absence = absMap.get(userId)
        if (absence) {
          if (absence.politica === 'omitir') continue
          if (absence.politica === 'reasignar' && absence.receptor_id) userId = absence.receptor_id
        }

        // Preparar Tarea
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

      // 4.5 Insertar con Idempotencia (UPSERT + Ignore Duplicates)
      if (tasksToInsert.length > 0) {
        // Necesitamos saber cuántos se insertaron vs omitieron
        // Supabase upsert no devuelve count de ignorados fácilmente, así que hacemos un select count previo para aproximar
        // O simplemente intentamos insertar y contamos el éxito
        
        const { error: upsertError } = await supabaseAdmin
          .from('task_instances')
          .upsert(tasksToInsert, { 
            onConflict: 'assignment_id,fecha_programada', 
            ignoreDuplicates: true 
          })
        
        if (upsertError) {
          console.error(`Error inserting tasks for tenant ${tId}:`, upsertError)
          // No detenemos todo, seguimos con siguiente tenant
        } else {
          // Asumimos que intentamos generar N. La BD manejará los duplicados silenciosamente.
          totalGenerated += tasksToInsert.length 
        }
      }
    }

    // 5. RESPUESTA FINAL
    return sendResponse(200, {
      ok: true,
      message: "Proceso finalizado correctamente.",
      date: date,
      generated: totalGenerated,
      skipped: totalSkipped, // Simplificado
      triggeredBy: triggerSource
    })

  } catch (error) {
    console.error("❌ UNHANDLED EXCEPTION:", error)
    return sendResponse(500, { 
      ok: false, 
      code: "INTERNAL_ERROR", 
      message: error.message || "Unknown error",
      details: error.stack
    })
  }
})