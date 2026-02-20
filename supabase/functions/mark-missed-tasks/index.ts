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

    // 1. Autorización por Service Key (Cron Jobs internos)
    if (token === supabaseServiceKey) {
      isAuthorized = true;
      targetTenantId = requestedTenantId; // Confiamos en el input del sistema
    } else {
      // 2. Autorización por Usuario (Request desde Frontend)
      const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)
      const { data: { user }, error } = await supabaseClient.auth.getUser(token)
      
      if (user && !error) {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('role, tenant_id')
          .eq('id', user.id)
          .single()
        
        // Permitir Superadmin, Director y Líder
        const allowedRoles = ['superadmin', 'director', 'lider'];
        
        if (profile && allowedRoles.includes(profile.role)) {
          isAuthorized = true;
          
          if (profile.role === 'superadmin') {
            // Superadmin usa el tenant enviado en el body (Impersonation)
            targetTenantId = requestedTenantId || profile.tenant_id;
          } else {
            // Directores y Líderes están confinados a su propio tenant
            targetTenantId = profile.tenant_id;
          }
        }
      }
    }

    if (!isAuthorized) {
      console.error("Unauthorized attempt to mark missed tasks");
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Permisos insuficientes.' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    let targetDateStr = body.date;
    if (!targetDateStr) {
      const now = new Date();
      // 'en-CA' formato es YYYY-MM-DD, perfecto para ISO
      const formatter = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      targetDateStr = formatter.format(now);
    }

    // Actualizar tareas pendientes
    let query = supabase.from('task_instances')
      .update({ estado: 'incumplida' })
      .eq('estado', 'pendiente')
      .lte('fecha_programada', targetDateStr);

    if (targetTenantId) {
        query = query.eq('tenant_id', targetTenantId);
    }

    const { data, error } = await query.select('id');

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, updated: data.length, date: targetDateStr, tenant: targetTenantId }),
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