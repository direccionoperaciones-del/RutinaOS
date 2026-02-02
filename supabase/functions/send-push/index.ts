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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    // Validar entorno
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')

    if (!vapidPublic || !vapidPrivate) {
      console.error("FALTAN LLAVES VAPID EN SECRETS");
      throw new Error("Configuración de servidor incompleta: Faltan llaves VAPID.");
    }

    try {
      webpush.setVapidDetails(
        'mailto:admin@movacheck.app',
        vapidPublic,
        vapidPrivate
      );
    } catch (err) {
      console.error("Error configurando VAPID:", err);
      throw new Error("Llaves VAPID inválidas.");
    }

    const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!)
    const { user_id, title, body, url, direct_subscription } = await req.json()

    // --- MODO TEST (DIAGNÓSTICO) ---
    if (direct_subscription) {
      try {
        const payload = JSON.stringify({ title, body, url });
        await webpush.sendNotification(direct_subscription, payload);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message, statusCode: err.statusCode }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // --- MODO NORMAL ---
    if (!user_id) throw new Error("User ID requerido.");

    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id);

    if (!subs || subs.length === 0) {
      console.log(`Usuario ${user_id} no tiene dispositivos registrados.`);
      return new Response(JSON.stringify({ success: false, message: "No devices found" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const payload = JSON.stringify({ title, body, url });
    
    const results = await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, payload);
        return { success: true };
      } catch (err: any) {
        console.error(`Error enviando a sub ${sub.id}:`, err.statusCode, err.message);
        
        // Borrar suscripción inválida (410 Gone / 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        }
        return { success: false, error: err.message };
      }
    }));

    const successCount = results.filter(r => r.success).length;
    console.log(`Push enviado: ${successCount}/${subs.length} éxitos.`);

    return new Response(
      JSON.stringify({ success: true, sent: successCount, total: subs.length }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Critical Error send-push:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})