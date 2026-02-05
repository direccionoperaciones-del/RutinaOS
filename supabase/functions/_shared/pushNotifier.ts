import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error("[push] CRITICAL: Missing environment variables.");
    return { success: false, error: "Configuration Error", found: 0, sent: 0, failed: 0 };
  }

  // 2. Configurar WebPush
  try {
    // @ts-ignore: web-push types might conflict slightly with Deno
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (err: any) {
    console.error("[push] VAPID Setup Error:", err.message);
    return { success: false, error: "VAPID Error", found: 0, sent: 0, failed: 0 };
  }

  // 3. Crear Cliente Admin
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 4. Buscar Suscripciones
  console.log(`[push] lookup subscriptions for user: ${userId}`);
  
  const { data: subs, error: dbError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (dbError) {
    console.error("[push] DB Error fetching subscriptions:", dbError.message);
    return { success: false, error: dbError.message, found: 0, sent: 0, failed: 0 };
  }

  const foundCount = subs?.length || 0;
  console.log(`[push] subscriptions found: ${foundCount}`);

  if (foundCount === 0) {
    return { success: true, found: 0, sent: 0, failed: 0, message: "No active subscriptions for user" };
  }

  // 5. Enviar con conteo
  const payloadString = JSON.stringify(payload);
  let sentCount = 0;
  let failCount = 0;

  await Promise.all(subs.map(async (sub: any) => {
    try {
      // @ts-ignore
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
        status: statusCode, 
        msg: err.message 
      });

      // Limpieza automática de suscripciones muertas (410 Gone / 404 Not Found)
      if (statusCode === 410 || statusCode === 404) {
        console.log(`[push] Deleting dead subscription: ${sub.id}`);
        await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }));

  console.log(`[push] finished for user ${userId}`, { found: foundCount, sent: sentCount, failed: failCount });
  
  return { 
    success: true, 
    found: foundCount,
    sent: sentCount, 
    failed: failCount 
  };
};