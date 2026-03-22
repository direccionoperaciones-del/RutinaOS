import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendPushToUser } from "../_shared/pushNotifier.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Authenticate User
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Auth required');
    const { data: { user: auditor }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !auditor) throw new Error('Unauthorized');

    // 2. Verify Auditor Role & Tenant
    const { data: auditorProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', auditor.id)
      .single();

    if (!auditorProfile) throw new Error('Profile not found');

    const allowedRoles = ['director', 'lider', 'auditor', 'superadmin'];
    if (!allowedRoles.includes(auditorProfile.role)) {
      return new Response(JSON.stringify({ error: 'Permission denied. Role not authorized.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { taskId, status, note } = await req.json();

    // 3. Fetch Task to Verify Tenant
    const { data: task } = await supabaseAdmin
      .from('task_instances')
      .select('completado_por, routine_templates(nombre), tenant_id')
      .eq('id', taskId)
      .single();

    if (!task) throw new Error('Task not found');

    // 4. Verify Tenant Match (Prevent Cross-Tenant Modification)
    if (auditorProfile.role !== 'superadmin' && task.tenant_id !== auditorProfile.tenant_id) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Tenant mismatch.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. Update Task
    const { error: updError } = await supabaseAdmin
      .from('task_instances')
      .update({
        audit_status: status === 'approved' ? 'aprobado' : 'rechazado',
        audit_at: new Date().toISOString(),
        audit_by: auditor.id,
        audit_notas: note
      })
      .eq('id', taskId);

    if (updError) throw updError;

    // 6. Notify Executor
    if (task.completado_por && task.completado_por !== auditor.id) {
      const isApproved = status === 'approved';
      const title = isApproved ? '✅ Tarea Aprobada' : '🚨 Tarea Rechazada';
      const body = `${isApproved ? 'Aprobada' : 'Rechazada'}: ${task.routine_templates?.nombre}`;

      // Insert Notification
      await supabaseAdmin.from('notifications').insert({
        tenant_id: task.tenant_id,
        user_id: task.completado_por,
        type: isApproved ? 'routine_approved' : 'routine_rejected',
        title,
        entity_id: taskId
      });

      // Send Push
      await sendPushToUser(task.completado_por, {
        title,
        body,
        url: '/tasks'
      });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})