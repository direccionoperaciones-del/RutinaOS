import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// CONFIGURACIÓN MANUAL (Opcional si no usas Secrets)
// Solo se usa si no existen las variables de entorno
const MANUAL_VAPID_PUBLIC = "";
const MANUAL_VAPID_PRIVATE = "";
const MANUAL_SUBJECT = "mailto:admin@example.com";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // VAPID Configuration: Prioridad Env Vars -> Hardcoded -> Error
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || MANUAL_VAPID_PUBLIC;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || MANUAL_VAPID_PRIVATE;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || MANUAL_SUBJECT;

    if (!vapidPublicKey || !vapidPrivateKey) {
       throw new Error("VAPID Keys not configured on server.");
    }

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey
    )

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { userId, title, body, url } = await req.json()

    if (!userId || !title) {
        throw new Error("Missing userId or title");
    }

    // 1. Obtener suscripciones del usuario
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: 'No subscriptions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Enviar a cada dispositivo
    const notifications = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      }

      const payload = JSON.stringify({
        title,
        body,
        url: url || '/'
      })

      try {
        await webpush.sendNotification(pushSubscription, payload)
        
        // Actualizar last_used
        await supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id)
            
        return { success: true }
      } catch (error: any) {
        // Si el endpoint ya no es válido (410 Gone), borrar suscripción
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`Subscription expired/invalid: ${sub.id}`)
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
        return { success: false, error: error.message }
      }
    })

    await Promise.all(notifications)

    return new Response(JSON.stringify({ success: true, count: notifications.length }), {
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