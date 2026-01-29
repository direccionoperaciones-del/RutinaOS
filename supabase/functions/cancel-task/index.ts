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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Auth & Role Check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) throw new Error('Unauthorized')

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()

    if (!['director', 'lider'].includes(profile?.role || '')) {
      return new Response(JSON.stringify({ error: 'Permiso denegado. Solo Directores y Líderes pueden cancelar tareas.' }), { status: 403, headers: corsHeaders })
    }

    // 2. Parse Body
    const { taskId, reason, scope } = await req.json()

    if (!taskId || !reason) {
      return new Response(JSON.stringify({ error: 'ID de tarea y motivo son obligatorios.' }), { status: 400, headers: corsHeaders })
    }

    // 3. Get Task
    const { data: task, error: taskError } = await supabase
      .from('task_instances')
      .select('id, estado, tenant_id, assignment_id')
      .eq('id', taskId)
      .single()

    if (taskError || !task) throw new Error('Tarea no encontrada.')

    // Security: Tenant isolation
    if (task.tenant_id !== profile.tenant_id) throw new Error('Unauthorized tenant.')

    // Validation: Cannot cancel completed tasks
    if (task.estado.startsWith('completada')) {
      return new Response(JSON.stringify({ error: 'No se puede cancelar una tarea que ya fue completada.' }), { status: 400, headers: corsHeaders })
    }

    // 4. Execute Cancellation (Update Task)
    const { error: updateError } = await supabase
      .from('task_instances')
      .update({
        estado: 'cancelada',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
        cancel_reason: reason
      })
      .eq('id', taskId)

    if (updateError) throw updateError

    // 5. Handle Scope "TODAY_AND_FUTURE" (Disable Assignment)
    let extraMessage = ""
    if (scope === 'future' && task.assignment_id) {
      const { error: assignError } = await supabase
        .from('routine_assignments')
        .update({ 
          estado: 'inactiva',
          notas: `Desactivada automáticamente al cancelar tarea del día. Motivo: ${reason}`
        })
        .eq('id', task.assignment_id)
      
      if (!assignError) {
        extraMessage = " y se ha desactivado la asignación recurrente."
      }
    }

    // 6. Audit Log (System)
    await supabase.from('system_audit_log').insert({
      tenant_id: profile.tenant_id,
      user_id: user.id,
      action: 'cancel_task',
      table_name: 'task_instances',
      record_id: taskId,
      new_values: { reason, scope, state: 'cancelada' }
    })

    return new Response(
      JSON.stringify({ success: true, message: `Tarea cancelada correctamente${extraMessage}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Cancel Error:", error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})