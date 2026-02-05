import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendPushToUser } from "../_shared/pushNotifier.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { message_id } = await req.json()
    if (!message_id) throw new Error("Message ID missing");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Obtener Mensaje
    const { data: msg, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('tipo, asunto, cuerpo')
      .eq('id', message_id)
      .single();

    if (msgError || !msg) throw new Error("Message not found");

    // Obtener Destinatarios
    const { data: recipients, error: rxError } = await supabaseAdmin
      .from('message_receipts')
      .select('user_id')
      .eq('message_id', message_id);

    if (rxError) throw rxError;

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No recipients" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let prefix = "Nuevo Mensaje";
    if (msg.tipo === 'comunicado') prefix = "📢 Comunicado";
    if (msg.tipo === 'tarea_flash') prefix = "🚨 Tarea Flash";

    const title = `${prefix}: ${msg.asunto}`;
    const body = msg.cuerpo.length > 100 ? msg.cuerpo.substring(0, 100) + '...' : msg.cuerpo;

    // Enviar en paralelo
    await Promise.allSettled(recipients.map(r => 
      sendPushToUser(r.user_id, { title, body, url: '/messages' })
    ));

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("Notify Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})