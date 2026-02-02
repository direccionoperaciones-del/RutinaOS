import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
// FIX CRÍTICO: ?target=deno asegura que las dependencias de Node (crypto, etc) se polyfillen correctamente
import webpush from "https://esm.sh/web-push@3.6.7?target=deno"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Manejo inmediato de CORS (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("[send-push] Iniciando ejecución...");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    // Limpieza de llaves (Trim) para evitar errores de copy-paste
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')?.trim()
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')?.trim()

    // Validación temprana de configuración
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Faltan variables de entorno de Supabase.")
    }
    if (!vapidPublic || !vapidPrivate) {
        console.error("[send-push] Faltan llaves VAPID en Secrets.");
        throw new Error("Configuración VAPID incompleta. Revise los Secrets del proyecto.")
    }

    // Configuración de WebPush
    try {
      webpush.setVapidDetails(
        'mailto:admin@movacheck.app',
        vapidPublic,
        vapidPrivate
      )
    } catch (configError) {
      console.error("[send-push] Error configurando VAPID:", configError);
      throw new Error(`Llaves VAPID inválidas: ${configError.message}`)
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    // Parseo seguro del body
    let bodyData;
    try {
        bodyData = await req.json()
    } catch(e) {
        throw new Error("El cuerpo de la petición no es un JSON válido.")
    }

    const { user_id, title, body, url } = bodyData

    if (!user_id) {
      throw new Error("Se requiere 'user_id' para enviar la notificación.")
    }

    console.log(`[send-push] Enviando a usuario: ${user_id}`);

    // Obtener suscripciones
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id)

    if (subError) throw subError

    if (!subscriptions || subscriptions.length === 0) {
      console.log("[send-push] Sin suscripciones activas para este usuario.");
      return new Response(
        JSON.stringify({ success: false, message: 'El usuario no tiene dispositivos registrados.' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const payload = JSON.stringify({ title, body, url: url || '/' })
    let successCount = 0;
    
    // Enviar en paralelo
    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          // Validación extra de datos de suscripción antes de enviar
          if (!sub.endpoint || !sub.p256dh || !sub.auth) {
              console.warn(`[send-push] Suscripción corrupta detectada (ID: ${sub.id}), eliminando...`);
              await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
              return { success: false, error: "Datos de suscripción incompletos" };
          }

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
          console.error(`[send-push] Error envío individual (ID: ${sub.id}):`, error)
          
          // 410 (Gone) / 404 (Not Found): Suscripción muerta -> Limpiar BD
          if (error.statusCode === 410 || error.statusCode === 404) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
            return { success: false, error: "Dispositivo ya no disponible", removed: true }
          }
          
          // 401/403: Llaves VAPID incorrectas
          if (error.statusCode === 401 || error.statusCode === 403) {
             return { success: false, error: "Error de autenticación VAPID", authError: true }
          }

          return { success: false, error: error.message || "Error desconocido" }
        }
      })
    )

    console.log(`[send-push] Finalizado. Éxitos: ${successCount}/${subscriptions.length}`);

    // Verificar si falló todo por auth
    const authFailures = results.filter(r => r.authError).length;
    if (authFailures > 0 && authFailures === subscriptions.length) {
        throw new Error("Desincronización de llaves VAPID. Por favor reinicia las notificaciones en el dispositivo.");
    }

    return new Response(
      JSON.stringify({ success: successCount > 0, results, sent: successCount }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error("[send-push] Error Fatal:", error)
    // Devolvemos JSON incluso en error fatal para que el cliente lo pueda leer
    return new Response(
      JSON.stringify({ error: error.message }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})