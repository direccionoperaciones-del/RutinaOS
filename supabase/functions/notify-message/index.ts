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
    console.log(`[notify-message] START. Received ID: ${message_id}`);

    if (!message_id) throw new Error("Message ID missing");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Cliente con Service Role (Bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Obtener Mensaje
    console.log(`[notify-message] Fetching message details...`);
    const { data: msg, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('tipo, asunto, cuerpo')
      .eq('id', message_id)
      .single();

    if (msgError) {
      console.error(`[notify-message] ❌ Error fetching message:`, msgError);
      throw new Error("Message fetch failed");
    }

    if (!msg) {
      console.error(`[notify-message] ❌ Message not found in DB`);
      throw new Error("Message not found");
    }

    console.log("[notify-message] Message found:", { 
      tipo: msg.tipo, 
      asunto: msg.asunto?.substring(0, 30) 
    });

    // 2. Obtener Destinatarios (Receipts)
    console.log(`[notify-message] Fetching recipients...`);
    const { data: recipients, error: rxError } = await supabaseAdmin
      .from('message_receipts')
      .select('user_id')
      .eq('message_id', message_id);

    if (rxError) {
      console.error(`[notify-message] ❌ Error fetching recipients:`, rxError);
      throw rxError;
    }

    console.log("[notify-message] Recipients found:", { 
      count: recipients?.length || 0,
      userIds: recipients?.map(r => r.user_id).slice(0, 3) // Log first 3 IDs
    });

    if (!recipients || recipients.length === 0) {
      console.warn("[notify-message] ⚠️ No recipients found. Aborting push.");
      return new Response(JSON.stringify({ success: true, message: "No recipients" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Preparar Payload
    let prefix = "Nuevo Mensaje";
    if (msg.tipo === 'comunicado') prefix = "📢 Comunicado";
    if (msg.tipo === 'tarea_flash') prefix = "🚨 Tarea Flash";

    const title = `${prefix}: ${msg.asunto}`;
    const body = msg.cuerpo.length > 100 ? msg.cuerpo.substring(0, 100) + '...' : msg.cuerpo;

    console.log(`[notify-message] Payload prepared. Title: "${title}"`);

    // 4. Enviar en paralelo
    console.log(`[notify-message] 🚀 Starting batch send to ${recipients.length} users...`);
    
    const results = await Promise.allSettled(recipients.map(r => 
      sendPushToUser(r.user_id, { title, body, url: '/messages' })
    ));

    // Analizar resultados
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    console.log(`[notify-message] FINISHED. Success: ${successful}, Failed: ${failed}`);

    return new Response(JSON.stringify({ success: true, sent: successful, failed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("[notify-message] CRITICAL ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})