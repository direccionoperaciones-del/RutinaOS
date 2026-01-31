import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = "mailto:admin@movacheck.app"

    if (!vapidPublic || !vapidPrivate) throw new Error("VAPID keys missing")

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

    // Cliente Admin para operaciones de sistema
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Obtener Payload (Soporta llamada directa o desde Trigger/Webhook)
    const bodyReq = await req.json()
    
    // Si viene desde el Trigger, el dato está en 'record'. Si es manual, en root.
    const record = bodyReq.record || bodyReq; 
    
    // Validar datos mínimos
    if (!record.user_id || !record.title) {
        throw new Error("Invalid payload: missing user_id or title")
    }

    const queueId = record.id; // Puede ser null si es prueba manual
    const { user_id, title, body, url } = record;

    console.log(`[Push Worker] Procesando para Usuario: ${user_id} | QueueID: ${queueId || 'MANUAL'}`)

    // 2. Obtener Suscripciones
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id)

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`[Push Worker] Usuario ${user_id} no tiene dispositivos.`)
      if (queueId) {
        await supabaseAdmin.from('notification_queue').update({ 
            status: 'failed', 
            response_log: { error: 'No subscriptions found' },
            processed_at: new Date().toISOString()
        }).eq('id', queueId)
      }
      return new Response(JSON.stringify({ result: 'no_subs' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Enviar a todos los dispositivos
    const pushPayload = JSON.stringify({ title, body, url: url || '/' })
    const results = []

    const promises = subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }

      try {
        await webpush.sendNotification(pushConfig, pushPayload, {
          TTL: 60 * 60 * 24, // 24 horas de vida
          headers: { 'Urgency': 'high' } // Prioridad alta para despertar Android en Doze mode
        })
        return { status: 'success', sub_id: sub.id }
      } catch (err: any) {
        // Manejo de suscripciones muertas (410 Gone / 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[Push Worker] Eliminando suscripción muerta: ${sub.id}`)
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
          return { status: 'deleted', sub_id: sub.id }
        }
        console.error(`[Push Worker] Error envío individual:`, err)
        return { status: 'error', sub_id: sub.id, error: err.message }
      }
    })

    const executionResults = await Promise.all(promises)
    const successCount = executionResults.filter(r => r.status === 'success').length

    // 4. Actualizar estado en la Cola
    if (queueId) {
      await supabaseAdmin.from('notification_queue').update({
        status: successCount > 0 ? 'sent' : 'failed',
        response_log: executionResults,
        processed_at: new Date().toISOString()
      }).eq('id', queueId)
    }

    return new Response(JSON.stringify({ success: true, results: executionResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("[Push Worker] Critical Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})