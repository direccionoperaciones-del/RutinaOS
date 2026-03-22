import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { crypto } from "https://deno.land/std@0.110.0/crypto/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Permitir desde Landing Page
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Precios hardcoded (o traer de DB) - Centavos COP
const PLANS = {
  'pro': 5000000,   // $50.000 COP
  'elite': 9000000  // $90.000 COP
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { plan, email } = await req.json()
    
    // Validar Plan
    const amountInCents = PLANS[plan as keyof typeof PLANS]
    if (!amountInCents) throw new Error("Plan inválido")

    // Variables de Entorno
    const integritySecret = Deno.env.get('WOMPI_INTEGRITY_SECRET')
    const pubKey = Deno.env.get('WOMPI_PUB_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!integritySecret || !pubKey) throw new Error("Configuración del servidor incompleta (Secrets)")

    // Generar Referencia Única: "new_{timestamp}_{random}"
    const reference = `new_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const currency = "COP"

    // Generar Firma SHA256: reference + amount + currency + secret
    const rawSignature = `${reference}${amountInCents}${currency}${integritySecret}`
    const encoder = new TextEncoder()
    const data = encoder.encode(rawSignature)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const integritySignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Guardar "Pre-Claim" en la Base de Datos (Sala de Espera)
    // Usamos fetch directo a Supabase API REST para no depender de librerías grandes si no queremos
    // O importamos createClient. Usaremos fetch para máxima velocidad en Deno.
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/subscription_claims`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        reference: reference,
        plan_type: plan,
        amount_in_cents: amountInCents,
        currency: currency,
        payer_email: email || null,
        status: 'PENDING',
        wompi_status: 'INIT', // Estado inicial antes de ir a Wompi
        wompi_transaction_id: `temp_${reference}` // Temporal para unique constraint si aplica
      })
    })

    if (!dbRes.ok) {
      const err = await dbRes.text()
      console.error("DB Error:", err)
      throw new Error("Error registrando intención de pago")
    }

    // Responder a la Landing
    return new Response(
      JSON.stringify({
        reference,
        amountInCents,
        currency,
        signature: integritySignature,
        publicKey: pubKey
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})