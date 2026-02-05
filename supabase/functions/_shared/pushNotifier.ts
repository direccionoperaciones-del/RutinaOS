import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import webpush from "npm:web-push@3.6.7";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export const sendPushToUser = async (userId: string, payload: PushPayload) => {
  const timestamp = new Date().toISOString();
  
  // 1. Validar Secrets
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
  const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@movacheck.app';

  console.log(`[push] env check`, { 
    ts: timestamp,
    hasUrl: !!SUPABASE_URL, 
    hasSrv: !!SUPABASE_SERVICE_ROLE_KEY, 
    hasVapidPub: !!VAPID_PUBLIC_KEY, 
    hasVapidPriv: !!VAPID_PRIVATE_KEY 
  });

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
  console.log(`[push] lookup subscriptions`, { userId });
  
  const { data: subs, error: dbError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (dbError) {
    console.error("[push] DB Error fetching subscriptions:", dbError.message);
    return { success: false, error: dbError.message };
  }

  console.log(`[push] subscriptions found`, { userId, count: subs?.length || 0 });

  if (!subs || subs.length === 0) {
    return { success: true, sent: 0, message: "No active subscriptions for user" };
  }

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
      
      console.error("[push] send failed", { 
        subId: sub.id, 
        endpoint: sub.endpoint.slice(0, 30) + '...', 
        status: statusCode, 
        msg: err.message 
      });

      if (statusCode === 410 || statusCode === 404) {
        console.log(`[push] Deleting dead subscription: ${sub.id}`);
        await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }));

  console.log(`[push] finished for user ${userId}`, { sent: sentCount, failed: failCount });
  return { success: true, sent: sentCount, failed: failCount };
};