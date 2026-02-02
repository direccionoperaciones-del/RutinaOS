import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.7?target=deno"

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

    webpush.setVapidDetails('mailto:admin@movacheck.app', vapidPublic, vapidPrivate)

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const { user_id, title, body, url, direct_subscription } = await req.json()

    // MODO DIAGNÓSTICO: Envío directo a una suscripción específica (bypaseando BD)
    if (direct_subscription) {
        console.log("[send-push] Modo Diagnóstico Directo");
        try {
            const result = await webpush.sendNotification(
                direct_subscription,
                JSON.stringify({ title: `[TEST] ${title}`, body, url })
            );
            return new Response(
                JSON.stringify({ success: true, statusCode: result.statusCode, message: "Envío directo exitoso" }), 
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            )
        } catch (error) {
            console.error("[send-push] Error diagnóstico:", error);
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    statusCode: error.statusCode, 
                    error: error.message,
                    headers: error.headers 
                }), 
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 } // Retornamos 200 para que el cliente lea el JSON de error
            )
        }
    }

    // MODO NORMAL: Envío a usuarios vía BD
    if (!user_id) throw new Error("Falta user_id");

    const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('*').eq('user_id', user_id);
    
    if (!subs?.length) return new Response(JSON.stringify({ success: false, message: 'Sin dispositivos' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

    const payload = JSON.stringify({ title, body, url: url || '/' });
    
    const results = await Promise.all(subs.map(async (sub) => {
        try {
            const res = await webpush.sendNotification({ 
                endpoint: sub.endpoint, 
                keys: { p256dh: sub.p256dh, auth: sub.auth } 
            }, payload);
            return { id: sub.id, success: true, status: res.statusCode };
        } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
                await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
                return { id: sub.id, success: false, status: err.statusCode, action: 'deleted' };
            }
            return { id: sub.id, success: false, status: err.statusCode || 500, error: err.message };
        }
    }));

    const successCount = results.filter(r => r.success).length;
    return new Response(JSON.stringify({ success: successCount > 0, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})