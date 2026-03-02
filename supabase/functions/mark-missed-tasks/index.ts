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
    
    const body = await req.json().catch(() => ({}))
    const requestedTenantId = body.tenant_id;
    const forceAll = body.force_all === true; // Nuevo parámetro para cierre manual forzoso

    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '') ?? ''
    
    let isAuthorized = false
    let targetTenantId: string | null = null;

    if (token === supabaseServiceKey) {
      isAuthorized = true;
      targetTenantId = requestedTenantId;
    } else {
      const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)
      const { data: { user }, error } = await supabaseClient.auth.getUser(token)
      
      if (user && !error) {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('role, tenant_id')
          .eq('id', user.id)
          .single()
        
        const allowedRoles = ['superadmin', 'director', 'lider'];
        if (profile && allowedRoles.includes(profile.role)) {
          isAuthorized = true;
          targetTenantId = profile.role === 'superadmin' ? (requestedTenantId || profile.tenant_id) : profile.tenant_id;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    let targetDateStr = body.date;
    const now = new Date();
    
    if (!targetDateStr) {
      const formatter = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
      });
      targetDateStr = formatter.format(now);
    }

    const todayDateObj = new Date(targetDateStr);
    const dayOfMonth = todayDateObj.getDate();

    let query = supabase.from('task_instances')
      .select(`
        id, 
        fecha_programada, 
        routine_templates (frecuencia, vencimiento_dia_mes, corte_1_limite, corte_2_limite)
      `)
      .eq('estado', 'pendiente')
      .lte('fecha_programada', targetDateStr);

    if (targetTenantId) {
        query = query.eq('tenant_id', targetTenantId);
    }

    const { data: candidates, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    const tasksToFail: string[] = [];

    candidates?.forEach((task: any) => {
      const routine = task.routine_templates;
      let shouldFail = true;

      // Si NO es un cierre forzoso (es decir, es el cron automático), respetamos los plazos extendidos
      if (!forceAll && routine) {
        const programada = new Date(task.fecha_programada);
        
        if (routine.frecuencia === 'mensual' && routine.vencimiento_dia_mes) {
          const isSameMonth = programada.getMonth() === todayDateObj.getMonth();
          if (isSameMonth && dayOfMonth <= routine.vencimiento_dia_mes) {
            shouldFail = false; 
          }
        }
        
        if (routine.frecuencia === 'quincenal') {
           const pDay = programada.getDate();
           if (pDay <= 15 && dayOfMonth <= (routine.corte_1_limite || 15)) {
             shouldFail = false;
           } else if (pDay > 15 && dayOfMonth <= (routine.corte_2_limite || 30)) {
             shouldFail = false;
           }
        }
      }

      if (shouldFail) {
        tasksToFail.push(task.id);
      }
    });

    let updatedCount = 0;
    if (tasksToFail.length > 0) {
      const { error: updateError, count } = await supabase
        .from('task_instances')
        .update({ estado: 'incumplida' })
        .in('id', tasksToFail)
        .select('id', { count: 'exact' });
      
      if (updateError) throw updateError;
      updatedCount = count || 0;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: updatedCount, 
        processed: candidates?.length || 0,
        preserved: (candidates?.length || 0) - updatedCount,
        mode: forceAll ? 'FORCE_CLOSE' : 'NORMAL',
        date: targetDateStr 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Error in mark-missed-tasks:", error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})