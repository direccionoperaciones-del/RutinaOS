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

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    // Validar usuario
    const { data: { user: auditor }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !auditor) throw new Error('Unauthorized')

    const { taskId, status, note } = await req.json()

    // Obtener tarea
    const { data: task } = await supabase
      .from('task_instances')
      .select('id, completado_por, fecha_programada, routine_templates(nombre), pdv(nombre), tenant_id')
      .eq('id', taskId)
      .single()

    if (!task) throw new Error('Task not found')

    // Actualizar estado
    const { error: updateError } = await supabase
      .from('task_instances')
      .update({
        audit_status: status === 'approved' ? 'aprobado' : 'rechazado',
        audit_at: new Date().toISOString(),
        audit_by: auditor.id,
        audit_notas: note
      })
      .eq('id', taskId)

    if (updateError) throw updateError

    // --- NOTIFICACIÓN INTERNA (Trigger disparará Push) ---
    if (task.completado_por && task.completado_por !== auditor.id) {
      const isApproved = status === 'approved'
      const title = isApproved ? '✅ Tarea Aprobada' : '🚨 Tarea Rechazada'
      
      // Insertar en tabla de notificaciones.
      // EL TRIGGER 'on_notification_created_push' DETECTARÁ ESTO Y ENCOLARÁ EL PUSH AUTOMÁTICAMENTE.
      await supabase.from('notifications').insert({
        tenant_id: task.tenant_id,
        user_id: task.completado_por,
        type: isApproved ? 'routine_approved' : 'routine_rejected',
        title: title,
        entity_id: taskId, 
        leido: false
      })
      
      console.log(`[Audit] Notificación insertada para ${task.completado_por}. El Trigger DB se encargará del Push.`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("[audit-execution] Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})