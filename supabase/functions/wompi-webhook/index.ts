import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { crypto } from "https://deno.land/std@0.110.0/crypto/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const eventsSecret = Deno.env.get('WOMPI_EVENTS_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!eventsSecret) throw new Error("Falta WOMPI_EVENTS_SECRET")

    const body = await req.json()
    const { event, data, signature, timestamp } = body
    const transaction = data.transaction

    // 1. Validar Checksum (Seguridad)
    // properties.checksum = SHA256(transaction.id + transaction.status + transaction.amount_in_cents + timestamp + events_secret)
    const rawString = `${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${eventsSecret}`
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawString))
    const calculatedChecksum = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

    if (signature.checksum !== calculatedChecksum) {
      console.error("Checksum mismatch!", signature.checksum, calculatedChecksum)
      return new Response("Invalid signature", { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 2. Registrar en Historial de Pagos (Payments)
    // Upsert para idempotencia (si Wompi reintenta, no duplicamos)
    await supabase.from('payments').upsert({
      wompi_transaction_id: transaction.id,
      reference: transaction.reference,
      amount_in_cents: transaction.amount_in_cents,
      currency: transaction.currency,
      status: transaction.status,
      payment_method_type: transaction.payment_method_type,
      raw_event: body,
      created_at: new Date(transaction.created_at || new Date()).toISOString()
    }, { onConflict: 'wompi_transaction_id' })

    // 3. Procesar Lógica de Negocio
    const reference = transaction.reference
    const status = transaction.status // APPROVED, DECLINED, VOIDED...

    if (reference.startsWith('new_')) {
      // Flujo A: Usuario Nuevo (Sala de Espera)
      // Actualizamos subscription_claims para que el frontend (polling) se entere
      const { error } = await supabase.from('subscription_claims').update({
        status: status === 'APPROVED' ? 'APPROVED' : 'REJECTED', // Normalizamos para frontend
        wompi_status: status,
        wompi_transaction_id: transaction.id,
        payer_email: transaction.customer_email,
        updated_at: new Date().toISOString()
      }).eq('reference', reference)

      if (error) console.error("Error updating claim:", error)

    } else if (reference.startsWith('upg_')) {
      // Flujo B: Usuario Existente (Upgrade)
      // La referencia es upg_{tenant_id}_{timestamp}
      const parts = reference.split('_')
      const tenantId = parts[1] // ID del tenant

      if (tenantId && status === 'APPROVED') {
        // Calcular plan basado en monto (lógica simple o buscar en DB)
        // Por simplicidad asumimos PRO si > 4000000, ELITE si > 8000000
        let newPlan = 'essential'
        if (transaction.amount_in_cents >= 8000000) newPlan = 'elite'
        else if (transaction.amount_in_cents >= 4000000) newPlan = 'pro'

        await supabase.from('tenants').update({
          plan_type: newPlan,
          subscription_status: 'active',
          wompi_customer_id: transaction.customer_data?.full_name || 'wompi_user',
          updated_at: new Date().toISOString()
        }).eq('id', tenantId)
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error("Webhook Error:", error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})