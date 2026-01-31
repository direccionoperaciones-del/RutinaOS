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

    // --- NOTIFICACIÓN PUSH ROBUSTA ---
    if (task.completado_por && task.completado_por !== auditor.id) {
      const isApproved = status === 'approved'
      const title = isApproved ? '✅ Tarea Aprobada' : '🚨 Tarea Rechazada'
      const routineName = task.routine_templates?.nombre || 'Rutina'
      const pdvName = task.pdv?.nombre || 'PDV'
      
      const body = isApproved 
        ? `Tu ejecución de "${routineName}" en ${pdvName} ha sido aprobada.` 
        : `CORRECCIÓN REQUERIDA:\nRutina: ${routineName}\nMotivo: ${note}\n\nToca para corregir.`

      // 1. Guardar en notificaciones internas
      await supabase.from('notifications').insert({
        tenant_id: task.tenant_id,
        user_id: task.completado_por,
        type: isApproved ? 'routine_approved' : 'routine_rejected',
        title: title,
        entity_id: taskId, 
        leido: false
      })

      // 2. Disparar Push (Usando Service Key para bypass de permisos)
      // Construimos la URL de la función manualmente
      // En Supabase local o producción, la estructura es standard
      const functionsUrl = `${supabaseUrl}/functions/v1/send-push`;
      
      console.log(`[Audit] Disparando Push System-to-User -> ${task.completado_por}`);

      // Usamos FETCH directo con la Service Key en el header Authorization
      // Esto simula que es el "Sistema" quien llama a la función, no el usuario Auditor
      await fetch(functionsUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`, // CLAVE MAESTRA
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: task.completado_por,
          title: title,
          body: body,
          url: '/tasks'
        })
      });
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