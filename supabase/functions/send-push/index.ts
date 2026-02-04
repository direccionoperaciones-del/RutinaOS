import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { sendPushToUser } from "../_shared/pushNotifier.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Obtener Datos
    const { user_id, title, body, url } = await req.json()
    console.log("[send-push] Manual Trigger", { user_id });

    if (!user_id) throw new Error("User ID requerido.");

    // 2. Usar lógica compartida
    // Nota: Pasamos 'null' como cliente porque la función shared lo crea internamente
    // Pero espera el argumento. Lo refactoricé para que cree su propio cliente.
    const result = await sendPushToUser(user_id, { title, body, url });

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