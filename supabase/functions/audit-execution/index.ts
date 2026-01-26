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
    const authHeader = req.headers.get('Authorization')!
    const { data: { user: auditor }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))

    if (authError || !auditor) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // 2. Parsear Body
    const { taskId, status, note } = await req.json()

    if (status === 'rejected' && (!note || !note.trim())) {
      return new Response(JSON.stringify({ error: 'La nota de auditoría es obligatoria para rechazar.' }), { status: 400, headers: corsHeaders })
    }

    // 3. Obtener Tarea y Detalles (PDV, Rutina)
    const { data: task, error: taskError } = await supabase
      .from('task_instances')
      .select('id, completado_por, fecha_programada, routine_templates(nombre), pdv(nombre), tenant_id')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
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

    // 5. Notificar al Ejecutor
    if (task.completado_por && task.completado_por !== auditor.id) {
      const isApproved = status === 'approved'
      const title = isApproved ? 'Rutina Aprobada ✅' : 'Tarea Rechazada ⚠️'
      const routineName = task.routine_templates?.nombre || 'Rutina'
      const pdvName = task.pdv?.nombre || 'PDV'
      const dateStr = task.fecha_programada
      
      // Cuerpo enriquecido con los datos solicitados
      const body = isApproved 
        ? `Tu ejecución de "${routineName}" en ${pdvName} del ${dateStr} ha sido aprobada.` 
        : `⚠️ Se ha rechazado tu tarea.\n\n📍 PDV: ${pdvName}\n📅 Fecha: ${dateStr}\n📋 Rutina: ${routineName}\n\n📝 Motivo: "${note}"\n\nPor favor corrige y reenvía.`

      await supabase.from('notifications').insert({
        tenant_id: task.tenant_id,
        user_id: task.completado_por,
        type: isApproved ? 'routine_approved' : 'routine_rejected',
        title: title,
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