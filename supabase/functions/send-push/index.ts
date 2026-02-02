import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. CORS Preflight - CRÍTICO para que el navegador no bloquee la petición
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    // Validar secretos
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')

    if (!supabaseUrl || !supabaseServiceKey || !vapidPublic || !vapidPrivate) {
      console.error("Faltan variables de entorno (SUPABASE_URL, SERVICE_ROLE o VAPID keys)")
      throw new Error("Error de configuración del servidor (Secretos faltantes).")
    }

    // Configurar Web Push
    try {
      webpush.setVapidDetails(
        'mailto:admin@movacheck.app',
        vapidPublic,
        vapidPrivate
      )
    } catch (e) {
      console.error("Error configurando VAPID:", e)
      throw new Error("Llaves VAPID inválidas.")
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    // 2. Parsear Body con seguridad
    let bodyReq
    try {
      bodyReq = await req.json()
    } catch (e) {
      throw new Error("El cuerpo de la petición no es un JSON válido.")
    }

    // Adaptador para soportar llamadas directas (invoke) o webhooks de base de datos
    const payload = bodyReq.record || bodyReq
    
    // Soportar tanto 'user_id' como 'userId'
    const targetUserId = payload.user_id || payload.userId
    const title = payload.title || "Notificación"
    const body = payload.body || "Tienes un nuevo mensaje"
    const url = payload.url || "/"

    if (!targetUserId) {
      throw new Error("Falta el ID del usuario destino (user_id).")
    }

    // 3. Obtener suscripciones
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', targetUserId)

    if (subError) throw subError

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'El usuario no tiene dispositivos registrados para notificaciones.' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // 4. Enviar notificaciones en paralelo
    const notificationPayload = JSON.stringify({ title, body, url })
    
    console.log(`Enviando a ${subscriptions.length} dispositivos para: ${targetUserId}`)

    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { 
              endpoint: sub.endpoint, 
              keys: { p256dh: sub.p256dh, auth: sub.auth } 
            }, 
            notificationPayload
          )
          return { success: true, id: sub.id }
        } catch (error) {
          console.error(`Fallo envío a ${sub.id}:`, error)
          
          // Si el error es 404 o 410, la suscripción ya no existe -> Borrarla
          if (error.statusCode === 410 || error.statusCode === 404) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
            return { success: false, id: sub.id, error: "Expirada/Eliminada" }
          }
          return { success: false, id: sub.id, error: error.message }
        }
      })
    )

    const successCount = results.filter(r => r.success).length

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount, 
        total: results.length,
        details: results 
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error("Error crítico en send-push:", error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno del servidor' }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})