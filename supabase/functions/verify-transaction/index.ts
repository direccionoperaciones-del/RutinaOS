import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { id } = await req.json() // Wompi Transaction ID
    
    if (!id) throw new Error("ID requerido")

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const wompiPubKey = Deno.env.get('WOMPI_PUB_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Buscar primero en nuestra BD (subscription_claims)
    // El webhook es rápido, usualmente ya habrá escrito aquí
    const { data: claim } = await supabase
      .from('subscription_claims')
      .select('*')
      .eq('wompi_transaction_id', id)
      .maybeSingle()

    // Si ya lo tenemos y está aprobado, retornamos
    if (claim && claim.status === 'APPROVED') {
      return new Response(JSON.stringify({ 
        status: 'APPROVED', 
        plan: claim.plan_type,
        reference: claim.reference 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Si no está en BD o sigue PENDING, consultamos a Wompi API
    // Esto es vital para el "Long Polling" del frontend si el webhook se retrasa
    const wompiRes = await fetch(`https://production.wompi.co/v1/transactions/${id}`, {
      headers: { 'Authorization': `Bearer ${wompiPubKey}` } // PubKey sirve para leer transacciones
    })
    
    if (!wompiRes.ok) {
      // Puede que el ID sea inválido o Wompi esté caído
      return new Response(JSON.stringify({ status: 'PENDING', message: "Wompi syncing..." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const wompiData = await wompiRes.json()
    const status = wompiData.data.status // APPROVED, DECLINED, PENDING

    // Si Wompi dice Approved pero nuestra BD no, forzamos actualización
    // (Opcional, pero ayuda a la consistencia)
    if (status === 'APPROVED') {
       // Intentamos actualizar claim usando la referencia que viene de Wompi
       const ref = wompiData.data.reference
       await supabase.from('subscription_claims').update({
         status: 'APPROVED',
         wompi_transaction_id: id,
         wompi_status: status
       }).eq('reference', ref)
       
       // Retornamos éxito aunque el update sea async
       // Necesitamos saber el plan. Si no está en el claim actualizado, lo inferimos o buscamos de nuevo
       const { data: updatedClaim } = await supabase.from('subscription_claims').select('plan_type, reference').eq('reference', ref).single()
       
       return new Response(JSON.stringify({ 
         status: 'APPROVED', 
         plan: updatedClaim?.plan_type || 'pro', // Fallback
         reference: ref 
       }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ status: status }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})