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

    // 1. Obtener Auditor (Usuario Actual)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: corsHeaders })
    }
    
    const { data: { user: auditor }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))

    if (authError || !auditor) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // 1.1 Verificar Rol
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', auditor.id)
      .single()

    if (!['director', 'lider', 'auditor'].includes(profile?.role || '')) {
      return new Response(JSON.stringify({ error: 'No tienes permisos.' }), { status: 403, headers: corsHeaders })
    }

    // 2. Parsear Body
    const { taskId, status, note } = await req.json()

    // 3. Obtener Tarea
    const { data: task } = await supabase
      .from('task_instances')
      .select('id, completado_por, fecha_programada, routine_templates(nombre), pdv(nombre, ciudad), tenant_id')
      .eq('id', taskId)
      .single()

    if (!task) {
      return new Response(JSON.stringify({ error: 'Tarea no encontrada' }), { status: 404, headers: corsHeaders })
    }

    // 4. Actualizar Tarea
    const updateData = {
      audit_status: status === 'approved' ? 'aprobado' : 'rechazado',
      audit_at: new Date().toISOString(),
      audit_by: auditor.id,
      audit_notas: note
    }

    const { error: updateError } = await supabase
      .from('task_instances')
      .update(updateData)
      .eq('id', taskId)

    if (updateError) throw updateError

    // 5. NOTIFICACIÓN PUSH REAL (Server-Side Trigger)
    // Esto asegura que llegue aunque la app esté cerrada
    if (task.completado_por && task.completado_por !== auditor.id) {
      const isApproved = status === 'approved'
      const title = isApproved ? '✅ Tarea Aprobada' : '🚨 Tarea Rechazada'
      const routineName = task.routine_templates?.nombre || 'Rutina'
      const pdvName = task.pdv?.nombre || 'PDV'
      
      const body = isApproved 
        ? `Tu ejecución de "${routineName}" ha sido aprobada.` 
        : `CORRECCIÓN REQUERIDA:\nRutina: ${routineName}\nMotivo: ${note}\n\nToca para corregir ahora.`

      // A) Insertar en base de datos (Historial)
      await supabase.from('notifications').insert({
        tenant_id: task.tenant_id,
        user_id: task.completado_por,
        type: isApproved ? 'routine_approved' : 'routine_rejected',
        title: title,
        entity_id: taskId, 
        leido: false
      })

      // B) Disparar Push Notification (Fuego real)
      console.log(`[Audit] Disparando Push a usuario ${task.completado_por}`)
      
      // Llamamos a la función send-push internamente usando invoke
      await supabase.functions.invoke('send-push', {
        body: {
          userId: task.completado_por,
          title: title,
          body: body,
          url: '/tasks' // Redirigir directo a mis tareas
        }
      })
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