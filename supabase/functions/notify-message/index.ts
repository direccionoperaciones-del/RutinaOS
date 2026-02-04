import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendPushToUser } from "../_shared/pushNotifier.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const timestamp = new Date().toISOString();
  
  try {
    // 1. Obtener Payload
    const { message_id } = await req.json()
    console.log("[notify-message] START", { messageId: message_id, ts: timestamp })

    if (!message_id) throw new Error("Message ID missing");

    // 2. Setup Cliente Admin (Para leer mensajes y recipients)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 3. Obtener Datos del Mensaje
    const { data: msg, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('tipo, asunto, cuerpo')
      .eq('id', message_id)
      .single();

    if (msgError || !msg) {
      console.error("[notify-message] Error fetching message:", msgError);
      throw new Error("Message not found");
    }

    // 4. Obtener Destinatarios
    const { data: recipients, error: rxError } = await supabaseAdmin
      .from('message_receipts')
      .select('user_id')
      .eq('message_id', message_id);

    if (rxError) throw rxError;

    console.log("[notify-message] recipients", { 
      count: recipients?.length || 0, 
      sample: recipients?.slice(0, 2) 
    });

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No recipients" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. Preparar Contenido
    let prefix = "Nuevo Mensaje";
    if (msg.tipo === 'comunicado') prefix = "📢 Comunicado";
    if (msg.tipo === 'tarea_flash') prefix = "🚨 Tarea Flash";

    const title = `${prefix}: ${msg.asunto}`;
    const body = msg.cuerpo.length > 120 ? msg.cuerpo.substring(0, 120) + '...' : msg.cuerpo;

    // 6. Enviar en Paralelo (Usando shared logic, NO HTTP)
    const promises = recipients.map(r => 
      sendPushToUser(r.user_id, {
        title,
        body,
        url: '/messages'
      })
    );

    await Promise.allSettled(promises);

    console.log("[notify-message] END - Batch processing complete");

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("[notify-message] ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})