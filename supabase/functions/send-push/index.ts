import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { sendPushToUser } from "../_shared/pushNotifier.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// URL absoluta del logo (copiada del manifest para consistencia)
const APP_ICON_URL = "https://lrnzxrrjcwkmwwldfdaq.supabase.co/storage/v1/object/public/LogoApp/LogoRunop1.jpg";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, title, body, url } = await req.json()

    if (!user_id) throw new Error("User ID requerido.");

    console.log(`[send-push] Preparando envío para: ${user_id}`);

    // Construir Payload Estricto para el Service Worker
    // Aseguramos que 'icon' siempre vaya, y que 'url' tenga un valor por defecto
    const payload = {
      title: title || "RunOp",
      body: body || "Tienes un mensaje nuevo en RunOp.",
      url: url || "/",
      icon: APP_ICON_URL,
      tag: "general-" + Date.now() // Tag único para evitar agrupación excesiva si no se desea
    };

    console.log("[send-push] Payload JSON:", JSON.stringify(payload));

    // Llamar al helper compartido
    // Nota: sendPushToUser internamente hace JSON.stringify del payload
    const result = await sendPushToUser(user_id, payload);

    return new Response(
      JSON.stringify(result), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("[send-push] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})