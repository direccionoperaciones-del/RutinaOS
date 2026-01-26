import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. Setup Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    // Usamos Service Key para poder escribir notificaciones a otros usuarios y actualizar tareas sin restricciones de RLS de frontend
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 2. Get User from Auth Header (Security Check)
    const authHeader = req.headers.get('Authorization')!
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Parse Body
    const { taskId, status, note } = await req.json()

    if (!taskId || !status) {
      return new Response(JSON.stringify({ error: 'Missing taskId or status' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (status === 'rejected' && (!note || !note.trim())) {
      return new Response(JSON.stringify({ error: 'Audit note is required for rejection' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 4. Verify Role (Must be Director, Lider, Auditor)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()

    const allowedRoles = ['director', 'lider', 'auditor']
    if (!profile || !allowedRoles.includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: Insufficient permissions' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 5. Fetch Task Details (to get executor)
    const { data: task, error: taskError } = await supabase
      .from('task_instances')
      .select('id, completado_por, routine_templates(nombre)')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 6. Update Task
    const updateData = {
      audit_status: status, // 'approved' | 'rejected'
      audit_at: new Date().toISOString(),
      audit_by: user.id,
      audit_notas: note
    }

    const { error: updateError } = await supabase
      .from('task_instances')
      .update(updateData)
      .eq('id', taskId)

    if (updateError) throw updateError

    // 7. Create Notification for Executor
    // Solo notificar si hay un usuario ejecutor definido
    if (task.completado_por) {
      const isApproved = status === 'approved'
      const title = isApproved ? 'Rutina Aprobada ✅' : 'Rutina Rechazada ⚠️'
      const routineName = task.routine_templates?.nombre || 'Rutina'
      const body = isApproved 
        ? `La ejecución de "${routineName}" ha sido aprobada por auditoría.` 
        : `La ejecución de "${routineName}" fue rechazada. Motivo: ${note}`

      await supabase.from('notifications').insert({
        tenant_id: profile.tenant_id,
        user_id: task.completado_por,
        type: isApproved ? 'routine_approved' : 'routine_rejected',
        title: title,
        // Usamos el entity_id para navegar al detalle
        entity_id: taskId, 
        leido: false
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})