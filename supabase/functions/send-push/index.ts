import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS para preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')

    if (!supabaseUrl || !supabaseServiceKey || !vapidPublic || !vapidPrivate) {
      throw new Error("Faltan variables de entorno (VAPID keys o Supabase credentials).")
    }

    // Configuración VAPID
    webpush.setVapidDetails(
      'mailto:admin@movacheck.app',
      vapidPublic,
      vapidPrivate
    )

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    const { user_id, title, body, url } = await req.json()

    if (!user_id) {
      throw new Error("Falta user_id en el cuerpo de la petición.")
    }

    // Obtener suscripciones del usuario
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id)

    if (subError) throw subError

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'No hay dispositivos registrados.' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Enviar notificaciones
    const payload = JSON.stringify({ title, body, url: url || '/' })
    
    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { 
              endpoint: sub.endpoint, 
              keys: { p256dh: sub.p256dh, auth: sub.auth } 
            }, 
            payload
          )
          return { success: true }
        } catch (error) {
          console.error(`Error enviando a ${sub.id}:`, error)
          // Eliminar suscripción si ya no es válida (404/410)
          if (error.statusCode === 410 || error.statusCode === 404) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
          }
          return { success: false, error: error.message }
        }
      })
    )

    return new Response(
      JSON.stringify({ success: true, results }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error("Error en send-push:", error)
    return new Response(
      JSON.stringify({ error: error.message }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})