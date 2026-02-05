import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { sendPushToUser } from "../_shared/pushNotifier.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, title, body, url } = await req.json()

    if (!user_id) throw new Error("User ID requerido.");

    const result = await sendPushToUser(user_id, { title, body, url });

    return new Response(
      JSON.stringify(result), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})