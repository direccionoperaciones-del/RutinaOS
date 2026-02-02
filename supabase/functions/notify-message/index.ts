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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { message_id } = await req.json()

    if (!message_id) throw new Error("message_id required");

    // 1. Obtener detalles del mensaje
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('asunto, tipo, cuerpo')
      .eq('id', message_id)
      .single();

    if (msgError || !message) throw new Error("Message not found");

    // 2. Obtener destinatarios desde message_receipts
    // (La función SQL send_broadcast_message ya creó los recibos)
    const { data: recipients, error: rxError } = await supabase
      .from('message_receipts')
      .select('user_id')
      .eq('message_id', message_id);

    if (rxError) throw rxError;

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ message: "No recipients found" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[notify-message] Enviando push a ${recipients.length} usuarios para mensaje: ${message.asunto}`);

    // 3. Enviar notificaciones en lotes (Batch processing)
    // Para V1 simple, iteramos. Para producción masiva, usaríamos una cola.
    // Usamos el endpoint send-push que ya creamos.
    
    const pushPromises = recipients.map(async (r) => {
        let titlePrefix = "Nuevo Mensaje";
        if (message.tipo === 'comunicado') titlePrefix = "📢 Comunicado";
        if (message.tipo === 'tarea_flash') titlePrefix = "🚨 Tarea Flash";

        try {
            await fetch(`${supabaseUrl}/functions/v1/send-push`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`
                },
                body: JSON.stringify({
                    user_id: r.user_id,
                    title: `${titlePrefix}: ${message.asunto}`,
                    body: message.cuerpo.substring(0, 100) + (message.cuerpo.length > 100 ? '...' : ''),
                    url: '/messages'
                })
            });
        } catch (e) {
            console.error(`Failed push for user ${r.user_id}`, e);
        }
    });

    // Esperar a que se envíen (no bloqueante para el cliente si se llama asíncrono, pero aquí esperamos para log)
    await Promise.allSettled(pushPromises);

    return new Response(JSON.stringify({ success: true, count: recipients.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("[notify-message] Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})