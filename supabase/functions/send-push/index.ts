import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    // TRIMMING CRÍTICO: Limpiar llaves de espacios/newlines
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')?.trim()
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')?.trim()

    if (!supabaseUrl || !supabaseServiceKey || !vapidPublic || !vapidPrivate) {
      throw new Error("Configuración incompleta: Verifique VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Supabase Secrets.")
    }

    // Configuración VAPID
    try {
      webpush.setVapidDetails(
        'mailto:admin@movacheck.app',
        vapidPublic,
        vapidPrivate
      )
    } catch (configError) {
      console.error("VAPID Config Error:", configError);
      throw new Error("Las llaves VAPID tienen un formato inválido. Verifique que sean las generadas correctamente.")
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    // Parseo seguro del body
    let bodyData;
    try {
        bodyData = await req.json()
    } catch(e) {
        throw new Error("Body inválido (JSON malformado)")
    }

    const { user_id, title, body, url } = bodyData

    if (!user_id) {
      throw new Error("Falta user_id.")
    }

    // Obtener suscripciones
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id)

    if (subError) throw subError

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'El usuario no tiene dispositivos registrados para notificaciones.' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const payload = JSON.stringify({ title, body, url: url || '/' })
    let successCount = 0;
    
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
          successCount++;
          return { success: true, id: sub.id }
        } catch (error) {
          console.error(`Error enviando a sub ${sub.id}:`, error)
          
          // Manejo de errores específicos
          // 410 (Gone) / 404 (Not Found): La suscripción ya no existe en el navegador -> Borrar de BD
          if (error.statusCode === 410 || error.statusCode === 404) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
            return { success: false, error: "Dispositivo no disponible (Suscripción eliminada)", removed: true }
          }
          
          // 401/403: Problema de llaves VAPID (Mismatch entre llave servidor y suscripción cliente)
          if (error.statusCode === 401 || error.statusCode === 403) {
             return { success: false, error: "Error de Autenticación Push (Posible cambio de llaves VAPID). El usuario debe reconectar.", authError: true }
          }

          return { success: false, error: error.message || "Error desconocido de envío" }
        }
      })
    )

    // Si fallaron todos por auth, lanzamos error general para que el cliente sepa que debe resetear
    const authFailures = results.filter(r => r.authError).length;
    if (authFailures > 0 && authFailures === subscriptions.length) {
        throw new Error("Desincronización de llaves VAPID. Por favor reinicia las notificaciones en el dispositivo.");
    }

    return new Response(
      JSON.stringify({ success: successCount > 0, results, sent: successCount }), 
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