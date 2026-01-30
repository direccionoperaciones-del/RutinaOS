import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// LLAVES DE PRODUCCIÓN DIRECTAS (Para eliminar errores de configuración)
const VAPID_PUBLIC = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBLYFpaaRWsEtzD9DxWo";
const VAPID_PRIVATE = "GeQw-dFjV_E_5_8s9_2q5_8s9_2q5_8s9_2q5_8s9_2"; 
const VAPID_SUBJECT = "mailto:admin@movacheck.app";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Configuración VAPID robusta
    try {
        webpush.setVapidDetails(
          VAPID_SUBJECT,
          VAPID_PUBLIC,
          VAPID_PRIVATE
        )
    } catch (err) {
        console.error("VAPID Config Error:", err);
        throw new Error("Error configurando sistema de notificaciones.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { userId, title, body, url } = await req.json()

    if (!userId || !title) {
        throw new Error("Missing userId or title");
    }

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: 'No subscriptions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
        
        await supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id)
            
        return { success: true }
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`Deleting expired subscription: ${sub.id}`)
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