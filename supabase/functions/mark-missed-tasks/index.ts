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
    
    // Header de autorización
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '') ?? ''
    
    let isAuthorized = false
    let requesterTenantId: string | null = null;

    if (token === supabaseServiceKey) {
      isAuthorized = true
    } else {
      const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)
      const { data: { user }, error } = await supabaseClient.auth.getUser(token)
      
      if (user && !error) {
        const { data: profile } = await supabaseClient.from('profiles').select('role, tenant_id').eq('id', user.id).single()
        if (profile?.role === 'director') {
          isAuthorized = true
          requesterTenantId = profile.tenant_id;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await req.json().catch(() => ({}))
    
    let targetDateStr = body.date;
    if (!targetDateStr) {
      const now = new Date()
      const colombiaOffset = -5 * 60 * 60 * 1000
      const nowColombia = new Date(now.getTime() + colombiaOffset)
      targetDateStr = nowColombia.toISOString().split('T')[0]
    }

    // Actualizar tareas pendientes
    let query = supabase.from('task_instances')
      .update({ estado: 'incumplida' })
      .eq('estado', 'pendiente')
      .lte('fecha_programada', targetDateStr);

    if (requesterTenantId) {
        query = query.eq('tenant_id', requesterTenantId);
    }

    const { data, error } = await query.select('id');

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, updated: data.length, date: targetDateStr }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})