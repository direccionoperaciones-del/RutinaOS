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
    
    // IMPORTANTE: Asegúrate de configurar estos secretos
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = "mailto:admin@movacheck.app"

    if (!vapidPublic || !vapidPrivate) throw new Error("VAPID keys missing")

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const bodyReq = await req.json()
    const record = bodyReq.record || bodyReq; 
    
    const targetUserId = record.user_id || record.userId;
    const title = record.title;
    const body = record.body;
    const url = record.url;

    if (!targetUserId || !title) throw new Error("Invalid payload")

    const queueId = record.id; 

    // Obtener Suscripciones
    const { data: subscriptions } = await supabaseAdmin.from('push_subscriptions').select('*').eq('user_id', targetUserId)

    if (!subscriptions || subscriptions.length === 0) {
      if (queueId) {
        await supabaseAdmin.from('notification_queue').update({ status: 'failed', response_log: { error: 'No subscriptions' }, processed_at: new Date().toISOString() }).eq('id', queueId)
      }
      return new Response(JSON.stringify({ result: 'no_subs' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const pushPayload = JSON.stringify({ title, body, url: url || '/' })
    
    const promises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, pushPayload, { TTL: 60 * 60 * 24, headers: { 'Urgency': 'high' } })
        return { status: 'success', sub_id: sub.id }
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
          return { status: 'deleted', sub_id: sub.id }
        }
        return { status: 'error', sub_id: sub.id, error: err.message }
      }
    })

    const executionResults = await Promise.all(promises)
    const successCount = executionResults.filter(r => r.status === 'success').length

    if (queueId) {
      await supabaseAdmin.from('notification_queue').update({
        status: successCount > 0 ? 'sent' : 'failed',
        response_log: executionResults,
        processed_at: new Date().toISOString()
      }).eq('id', queueId)
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})