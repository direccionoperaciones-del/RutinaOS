import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { sendPushToUser } from "../_shared/pushNotifier.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Manejo de CORS Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("[send-push] START");
    
    // 2. Validación de Entorno (Logs de diagnóstico)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    console.log("[send-push] env check", { 
      hasUrl: !!SUPABASE_URL, 
      hasSrv: !!SUPABASE_SERVICE_ROLE_KEY, 
      hasVapidPub: !!VAPID_PUBLIC_KEY, 
      hasVapidPriv: !!VAPID_PRIVATE_KEY 
    });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
       throw new Error("Faltan variables de entorno (Secrets) en Supabase.");
    }

    // 3. Parse Body
    let body;
    try {
        body = await req.json();
    } catch (e) {
        throw new Error("Body inválido o vacío (JSON esperado).");
    }

    const { user_id, title, body: msgBody, url } = body;
    console.log("[send-push] Payload recibido", { user_id, title });

    if (!user_id) throw new Error("User ID requerido en el body.");

    // 4. Usar lógica compartida
    const result = await sendPushToUser(user_id, { title, body: msgBody, url });

    return new Response(
      JSON.stringify(result), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error("[send-push] Error Fatal:", error.message);
    
    // Siempre devolver JSON con CORS, incluso en error 500
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: "Revisa los logs de la Edge Function para más información."
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})