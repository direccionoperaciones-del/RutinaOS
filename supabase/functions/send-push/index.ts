import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendPushToUser } from "../_shared/pushNotifier.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, title, body: msgBody, url } = await req.json();

    if (!user_id) throw new Error("User ID requerido en el body.");

    // Llamar a lógica compartida
    const result = await sendPushToUser(user_id, { title, body: msgBody, url });

    // Estructura de respuesta para diagnóstico preciso
    const responsePayload = {
      ok: result.success,
      found: result.found,
      sent: result.sent,
      failed: result.failed,
      error: result.error
    };

    console.log("[send-push] Result:", JSON.stringify(responsePayload));

    return new Response(
      JSON.stringify(responsePayload), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error("[send-push] Error Fatal:", error.message);
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message,
        found: 0, sent: 0, failed: 0
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})