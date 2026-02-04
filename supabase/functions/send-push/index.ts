import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendPushToUser, initVapid, webpush } from "../_shared/pushNotifier.ts"

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
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const { user_id, title, body, url, direct_subscription } = await req.json()

    // --- MODO TEST (Desde botón de configuración) ---
    if (direct_subscription) {
      try {
        initVapid(); // Asegurar configuración
        const payload = JSON.stringify({ title, body, url });
        await webpush.sendNotification(direct_subscription, payload);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        console.error("Error en test directo:", err);
        return new Response(JSON.stringify({ success: false, error: err.message, statusCode: err.statusCode }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // --- MODO NORMAL (Usando lógica compartida) ---
    if (!user_id) throw new Error("User ID requerido.");

    const result = await sendPushToUser(supabaseAdmin, user_id, { title, body, url });

    return new Response(
      JSON.stringify(result), 
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