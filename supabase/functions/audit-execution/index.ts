import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Auth required');
    const { data: { user: auditor }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !auditor) throw new Error('Unauthorized');

    const { taskId, status, note } = await req.json();

    // Update
    const { error: updError } = await supabase
      .from('task_instances')
      .update({
        audit_status: status === 'approved' ? 'aprobado' : 'rechazado',
        audit_at: new Date().toISOString(),
        audit_by: auditor.id,
        audit_notas: note
      })
      .eq('id', taskId);

    if (updError) throw updError;

    // Notify Executor
    const { data: task } = await supabase
      .from('task_instances')
      .select('completado_por, routine_templates(nombre), pdv(nombre), tenant_id')
      .eq('id', taskId)
      .single();

    if (task && task.completado_por && task.completado_por !== auditor.id) {
      const isApproved = status === 'approved';
      const title = isApproved ? '✅ Tarea Aprobada' : '🚨 Tarea Rechazada';
      const body = isApproved 
        ? `Aprobada: ${task.routine_templates?.nombre}`
        : `Rechazada: ${task.routine_templates?.nombre}. Nota: ${note}`;

      // Insert Notification
      await supabase.from('notifications').insert({
        tenant_id: task.tenant_id,
        user_id: task.completado_por,
        type: isApproved ? 'routine_approved' : 'routine_rejected',
        title,
        entity_id: taskId
      });

      // Send Push
      await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({
          user_id: task.completado_por,
          title,
          body,
          url: '/tasks' // Redirige a mis tareas
        })
      }).catch(console.error);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})