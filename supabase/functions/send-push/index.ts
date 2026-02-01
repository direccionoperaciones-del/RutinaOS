import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
// Usamos esm.sh para asegurar compatibilidad Deno/Edge
import webpush from "https://esm.sh/web-push@3.6.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // --- VALIDACIÓN CRÍTICA DE SECRETOS ---
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = "mailto:admin@movacheck.app"

    if (!vapidPublic || !vapidPrivate) {
      console.error("FALTAN LLAVES VAPID: Revisa los secretos en Supabase Edge Functions.")
      throw new Error("Configuración del servidor incompleta (VAPID Keys missing)")
    }

    try {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
    } catch (err: any) {
      console.error("Error configurando VAPID:", err)
      throw new Error(`Error en llaves VAPID: ${err.message}`)
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    // Parse body con seguridad
    let bodyReq;
    try {
      bodyReq = await req.json()
    } catch (e) {
      throw new Error("Invalid JSON body")
    }

    const record = bodyReq.record || bodyReq; 
    const targetUserId = record.user_id || record.userId;
    const title = record.title;
    const body = record.body;
    const url = record.url;

    if (!targetUserId || !title) {
      console.error("Payload inválido:", record)
      throw new Error("Faltan datos requeridos (user_id o title)")
    }

    const queueId = record.id; 

    // Obtener Suscripciones Activas
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', targetUserId)

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`Usuario ${targetUserId} no tiene suscripciones push activas.`)
      if (queueId) {
        await supabaseAdmin.from('notification_queue').update({ 
          status: 'failed', 
          response_log: { error: 'No subscriptions found' }, 
          processed_at: new Date().toISOString() 
        }).eq('id', queueId)
      }
      return new Response(JSON.stringify({ success: false, reason: 'no_subscriptions' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      })
    }

    const pushPayload = JSON.stringify({ 
      title, 
      body: body || 'Nueva notificación', 
      url: url || '/' 
    })
    
    console.log(`Enviando push a ${subscriptions.length} dispositivos para usuario ${targetUserId}`)

    const promises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { 
            endpoint: sub.endpoint, 
            keys: { p256dh: sub.p256dh, auth: sub.auth } 
          }, 
          pushPayload, 
          { TTL: 60 * 60 * 24 } // 24 horas de vida
        )
        return { status: 'success', sub_id: sub.id }
      } catch (err: any) {
        console.error(`Error enviando a sub ${sub.id}:`, err.statusCode, err.message)
        
        // Si el endpoint ya no es válido (410 Gone o 404 Not Found), borramos la suscripción
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
          return { status: 'deleted', sub_id: sub.id }
        }
        return { status: 'error', sub_id: sub.id, error: err.message }
      }
    })

    const executionResults = await Promise.all(promises)
    const successCount = executionResults.filter(r => r.status === 'success').length
    const deletedCount = executionResults.filter(r => r.status === 'deleted').length

    console.log(`Resultados: ${successCount} enviados, ${deletedCount} eliminados (inválidos).`)

    if (queueId) {
      await supabaseAdmin.from('notification_queue').update({
        status: successCount > 0 ? 'sent' : 'failed',
        response_log: executionResults,
        processed_at: new Date().toISOString()
      }).eq('id', queueId)
    }

    return new Response(
      JSON.stringify({ success: true, results: executionResults }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Critical Error in send-push:", error)
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})