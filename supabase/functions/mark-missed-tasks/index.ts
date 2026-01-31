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
    let triggeredBy = 'cron'
    let requesterTenantId: string | null = null;

    // 1. Verificar si es Cron (Service Key)
    if (token === supabaseServiceKey) {
      isAuthorized = true
    } else {
      // 2. Verificar si es Usuario Director (Manual)
      const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)
      const { data: { user }, error } = await supabaseClient.auth.getUser(token)
      
      if (user && !error) {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('role, tenant_id')
          .eq('id', user.id)
          .single()
        
        if (profile?.role === 'director') {
          isAuthorized = true
          triggeredBy = `manual_${user.email}`
          requesterTenantId = profile.tenant_id;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Obtener fecha target: Si viene en el body, se usa. Si no, se calcula hoy (COL).
    const body = await req.json().catch(() => ({}))
    const manualDate = body.date;

    let targetDateStr = manualDate;

    if (!targetDateStr) {
      // Cálculo automático (Hoy en Colombia UTC-5)
      const now = new Date()
      const colombiaOffset = -5 * 60 * 60 * 1000
      const nowColombia = new Date(now.getTime() + colombiaOffset)
      targetDateStr = nowColombia.toISOString().split('T')[0]
    }

    console.log(`[mark-missed-tasks] Ejecutando cierre (${triggeredBy}) para fecha (<=): ${targetDateStr}. Tenant: ${requesterTenantId || 'ALL'}`)

    // Actualizar tareas pendientes que vencieron en la fecha target o antes
    let query = supabase
      .from('task_instances')
      .update({ estado: 'incumplida' })
      .eq('estado', 'pendiente')
      .lte('fecha_programada', targetDateStr);

    // Apply security filter if triggered manually
    if (requesterTenantId) {
        query = query.eq('tenant_id', requesterTenantId);
    }

    const { data, error } = await query.select('id');

    if (error) throw error

    const message = `Cierre exitoso para ${targetDateStr}. Se marcaron ${data.length} tareas como incumplidas.`
    console.log(`[mark-missed-tasks] Success: ${message}`)

    return new Response(
      JSON.stringify({ success: true, message, updated: data.length, date: targetDateStr }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error(`[mark-missed-tasks] Error:`, error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})