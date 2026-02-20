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
    
    // Parse body primero para tener acceso a los parámetros
    const body = await req.json().catch(() => ({}))
    const requestedTenantId = body.tenant_id;

    // Header de autorización
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '') ?? ''
    
    let isAuthorized = false
    let targetTenantId: string | null = null;

    // 1. Autorización
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
    
    // Configuración de fecha
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

    // 2. Obtener tareas candidatas a vencer (Pendientes con fecha <= hoy)
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

    // 3. Filtrar cuáles REALMENTE deben vencerse
    const tasksToFail: string[] = [];

    candidates?.forEach((task: any) => {
      const routine = task.routine_templates;
      let shouldFail = true;

      // LÓGICA DE EXCEPCIÓN MENSUAL/QUINCENAL
      if (routine) {
        const programada = new Date(task.fecha_programada);
        // Solo aplicar lógica de preservación si la tarea es del mes actual o anterior pero dentro de rango
        // Para simplificar: Si es mensual, miramos el día de vencimiento.
        
        if (routine.frecuencia === 'mensual' && routine.vencimiento_dia_mes) {
          // Si hoy es día 6, y vence el 20, NO debe fallar.
          // Si hoy es día 21, y vencía el 20, SÍ debe fallar.
          // Nota: targetDateStr es "hoy".
          
          // Asumimos que la tarea es del mismo mes que "hoy". 
          // Si la tarea es del mes pasado (fecha_programada muy vieja), sí debería vencerse.
          const isSameMonth = programada.getMonth() === todayDateObj.getMonth();
          
          if (isSameMonth) {
             if (dayOfMonth <= routine.vencimiento_dia_mes) {
               shouldFail = false; // Aún tiene tiempo
             }
          }
        }
        
        // Lógica similar podría aplicar para Quincenal si se quisiera extender, 
        // pero por ahora nos enfocamos en el requerimiento Mensual.
      }

      if (shouldFail) {
        tasksToFail.push(task.id);
      }
    });

    // 4. Actualizar masivamente solo las filtradas
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