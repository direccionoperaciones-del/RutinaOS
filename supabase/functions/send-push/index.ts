import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { sendPushToUser } from "../_shared/pushNotifier.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Manejo de CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("[send-push] START");
    
    // 2. Validación Básica de Entorno (Fail fast)
    if (!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
       throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    }

    // 3. Parse Body
    let body;
    try {
        const text = await req.text();
        if (!text) throw new Error("Empty body");
        body = JSON.parse(text);
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
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: "Check function logs"
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})