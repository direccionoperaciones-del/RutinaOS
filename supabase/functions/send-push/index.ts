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
    
    // VAPID KEYS desde variables de entorno
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = "mailto:admin@movacheck.app"

    if (!vapidPublic || !vapidPrivate) {
      throw new Error("VAPID keys no configuradas en Edge Function secrets")
    }

    // Configurar Web Push
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { userId, title, body, url } = await req.json()

    if (!userId || !title) throw new Error("Faltan datos (userId, title)")

    // Obtener suscripciones del usuario
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No hay dispositivos suscritos' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Enviar a cada dispositivo
    const promises = subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }

      const payload = JSON.stringify({ title, body, url })

      try {
        await webpush.sendNotification(pushConfig, payload)
        
        // Actualizar último uso
        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id)
          
        return { status: 'ok', id: sub.id }
      } catch (err: any) {
        // Manejar suscripciones expiradas (410 Gone / 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Borrando suscripción expirada: ${sub.id}`)
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          return { status: 'deleted', id: sub.id }
        }
        console.error(`Error enviando a ${sub.id}:`, err)
        return { status: 'error', error: err.message }
      }
    })

    const results = await Promise.all(promises)

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})