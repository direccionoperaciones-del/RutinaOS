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

    if (!vapidPublic || !vapidPrivate) {
      throw new Error("VAPID keys no configuradas en Edge Function secrets")
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

    // Cliente con privilegios de Superusuario para leer suscripciones de CUALQUIER usuario
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Verificación de Seguridad Dual
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    let isAuthorized = false

    // Caso A: Llamada interna del sistema (usando Service Key)
    if (token === supabaseServiceKey) {
      isAuthorized = true;
      console.log("[send-push] Autorizado por Service Key (Sistema)")
    } 
    // Caso B: Llamada desde cliente (Usuario logueado)
    else if (token) {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
      if (user && !error) isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // 2. Proceso de Envío
    const { userId, title, body, url } = await req.json()

    if (!userId || !title) throw new Error("Faltan datos (userId, title)")

    // Leer suscripciones usando el cliente Admin (Bypassea RLS)
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    if (subError) throw subError;

    if (!subscriptions?.length) {
      console.log(`[send-push] Usuario ${userId} no tiene dispositivos registrados.`)
      return new Response(JSON.stringify({ success: true, message: 'No devices found', results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[send-push] Enviando a ${subscriptions.length} dispositivos del usuario ${userId}`)

    const promises = subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }

      const payload = JSON.stringify({ title, body, url })

      try {
        await webpush.sendNotification(pushConfig, payload, {
          TTL: 60,
          headers: { 'Urgency': 'high' }
        })
        
        // Registrar éxito
        await supabaseAdmin
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id)
          
        return { status: 'ok', id: sub.id }
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[send-push] Eliminando suscripción muerta: ${sub.id}`)
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
          return { status: 'deleted', id: sub.id }
        }
        console.error(`[send-push] Fallo envío a ${sub.id}:`, err)
        return { status: 'error', error: err.message }
      }
    })

    const results = await Promise.all(promises)

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error("[send-push] Critical Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})