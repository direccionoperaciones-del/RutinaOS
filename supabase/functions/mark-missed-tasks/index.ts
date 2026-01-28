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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    // Security Check: Verify Authorization header matches Service Role Key
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || authHeader.replace('Bearer ', '') !== supabaseServiceKey) {
      console.error("[mark-missed-tasks] Unauthorized access attempt")
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Obtener fecha actual en Colombia (UTC-5)
    // El servidor suele estar en UTC (0), así que restamos 5 horas
    const now = new Date()
    const colombiaOffset = -5 * 60 * 60 * 1000
    const nowColombia = new Date(now.getTime() + colombiaOffset)
    const todayStr = nowColombia.toISOString().split('T')[0]

    console.log(`[mark-missed-tasks] Ejecutando cierre para fecha (Colombia): ${todayStr}`)

    // Actualizar tareas pendientes que vencieron hoy o antes
    // Se asume que este script corre a las 23:55 hora Colombia
    const { data, error, count } = await supabase
      .from('task_instances')
      .update({ estado: 'incumplida' })
      .eq('estado', 'pendiente')
      .lte('fecha_programada', todayStr) // Menor o igual a hoy
      .select('id')

    if (error) {
      throw error
    }

    const message = `Se marcaron ${data.length} tareas como incumplidas para la fecha ${todayStr}`
    console.log(`[mark-missed-tasks] Success: ${message}`)

    // Registrar en Audit Log (Opcional pero recomendado)
    if (data.length > 0) {
       // Podríamos insertar en system_audit_log aquí si fuera necesario
    }

    return new Response(
      JSON.stringify({ success: true, message, updated: data.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error(`[mark-missed-tasks] Error:`, error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})