import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')?.trim()!
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')?.trim()!

    if (!vapidPublic || !vapidPrivate) {
      throw new Error("Faltan llaves VAPID en variables de entorno.")
    }

    webpush.setVapidDetails('mailto:admin@movacheck.app', vapidPublic, vapidPrivate)

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const { user_id, title, body, url, direct_subscription } = await req.json()

    // ---------------------------------------------------------
    // MODO DIAGNÓSTICO: Envío directo a objeto Subscription (Sin BD)
    // ---------------------------------------------------------
    if (direct_subscription) {
      console.log("[send-push] Modo Diagnóstico Directo");
      try {
        const payload = JSON.stringify({ title: `[TEST] ${title}`, body, url });
        const result = await webpush.sendNotification(direct_subscription, payload);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            results: [{ 
              endpoint: direct_subscription.endpoint, 
              status: result.statusCode, 
              success: true 
            }]
          }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      } catch (error: any) {
        console.error("[send-push] Fallo directo:", error);
        return new Response(
          JSON.stringify({ 
            success: false, 
            results: [{ 
              endpoint: direct_subscription.endpoint, 
              status: error.statusCode || 500, 
              success: false, 
              error: error.message 
            }]
          }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
    }

    // ---------------------------------------------------------
    // MODO NORMAL: Envío a usuarios (Desde BD)
    // ---------------------------------------------------------
    if (!user_id) throw new Error("Falta user_id");

    const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('*').eq('user_id', user_id);
    
    if (!subs?.length) {
      return new Response(
        JSON.stringify({ success: false, message: 'Sin dispositivos registrados', results: [] }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const payload = JSON.stringify({ title, body, url: url || '/' });
    
    const results = await Promise.all(subs.map(async (sub) => {
        try {
            const res = await webpush.sendNotification({ 
                endpoint: sub.endpoint, 
                keys: { p256dh: sub.p256dh, auth: sub.auth } 
            }, payload);
            
            return { 
              id: sub.id, 
              endpoint: sub.endpoint,
              success: true, 
              status: res.statusCode 
            };

        } catch (err: any) {
            const status = err.statusCode || 500;
            let action = 'none';

            // LIMPIEZA AUTOMÁTICA DE SUSCRIPCIONES MUERTAS
            if (status === 410 || status === 404) {
                console.log(`[send-push] Borrando suscripción muerta (${status}): ${sub.id}`);
                await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
                action = 'deleted';
            }

            return { 
              id: sub.id, 
              endpoint: sub.endpoint,
              success: false, 
              status: status, 
              error: err.message, 
              action 
            };
        }
    }));

    // El envío general se considera exitoso si AL MENOS UNO llegó (status 2xx)
    const successCount = results.filter(r => r.success).length;
    
    return new Response(
      JSON.stringify({ success: successCount > 0, results }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})