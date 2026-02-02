import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { message_id } = await req.json()
    if (!message_id) throw new Error("Message ID missing");

    // 1. Datos del mensaje
    const { data: msg } = await supabase.from('messages').select('tipo, asunto, cuerpo').eq('id', message_id).single();
    if (!msg) throw new Error("Message not found");

    // 2. Destinatarios
    const { data: recipients } = await supabase.from('message_receipts').select('user_id').eq('message_id', message_id);
    if (!recipients?.length) return new Response(JSON.stringify({ message: "No recipients" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // 3. Enviar a cada uno
    let prefix = "Nuevo Mensaje";
    if (msg.tipo === 'comunicado') prefix = "📢 Comunicado";
    if (msg.tipo === 'tarea_flash') prefix = "🚨 Tarea Flash";

    const title = `${prefix}: ${msg.asunto}`;
    const body = msg.cuerpo.length > 100 ? msg.cuerpo.substring(0, 100) + '...' : msg.cuerpo;

    // Usamos fetch interno para llamar a send-push
    // IMPORTANTE: Eliminamos /v1/ si supabaseUrl ya lo incluye, o aseguramos el formato
    const functionUrl = `${supabaseUrl}/functions/v1/send-push`;

    const promises = recipients.map(r => 
      fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          user_id: r.user_id,
          title,
          body,
          url: '/messages'
        })
      }).catch(e => console.error(`Error push user ${r.user_id}:`, e))
    );

    // No esperamos con await para no bloquear (Fire & Forget), pero Deno Edge functions se cierran si no esperas.
    // Usamos Promise.allSettled para esperar ejecución rápida.
    await Promise.allSettled(promises);

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("Error in notify-message:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})