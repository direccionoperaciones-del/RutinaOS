import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export const sendPushToUser = async (userId: string, payload: PushPayload) => {
  console.log(`[push] init for user: ${userId}`);
  
  // 1. Validar Secrets
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
  const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@movacheck.app';

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error("[push] CRITICAL: Missing environment variables.");
    return { success: false, error: "Configuration Error" };
  }

  // 2. Configurar WebPush
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (err: any) {
    console.error("[push] VAPID Setup Error:", err.message);
    return { success: false, error: "VAPID Error" };
  }

  // 3. Crear Cliente Admin
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 4. Buscar Suscripciones
  const { data: subs, error: dbError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (dbError) {
    console.error("[push] DB Error:", dbError.message);
    return { success: false, error: dbError.message };
  }

  if (!subs || subs.length === 0) {
    console.log(`[push] No subscriptions for ${userId}`);
    return { success: true, sent: 0, message: "No active subscriptions" };
  }

  console.log(`[push] Found ${subs.length} subscriptions`);

  // 5. Enviar
  const payloadString = JSON.stringify(payload);
  let sentCount = 0;
  let failCount = 0;

  await Promise.all(subs.map(async (sub: any) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, payloadString);
      
      sentCount++;
    } catch (err: any) {
      failCount++;
      const statusCode = err.statusCode;
      
      // Limpieza automática
      if (statusCode === 410 || statusCode === 404) {
        console.log(`[push] Cleaning dead sub: ${sub.id}`);
        await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error(`[push] Error sending to ${sub.id}:`, err.message);
      }
    }
  }));

  console.log(`[push] Result: ${sentCount} sent, ${failCount} failed`);
  return { success: true, sent: sentCount, failed: failCount };
};