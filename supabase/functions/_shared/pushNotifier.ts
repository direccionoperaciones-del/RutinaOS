import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Inicializar configuración VAPID (se puede llamar múltiples veces sin problema)
const initVapid = () => {
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');

  if (!vapidPublic || !vapidPrivate) {
    console.error("FALTAN LLAVES VAPID EN SECRETS");
    throw new Error("Configuración VAPID incompleta");
  }

  try {
    webpush.setVapidDetails(
      'mailto:admin@movacheck.app',
      vapidPublic,
      vapidPrivate
    );
  } catch (err) {
    console.error("Error configurando VAPID:", err);
    throw new Error("Llaves VAPID inválidas");
  }
};

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Función principal para enviar a un usuario
export const sendPushToUser = async (
  supabaseAdmin: any, 
  userId: string, 
  payload: PushPayload
) => {
  // Asegurar VAPID
  initVapid();

  // 1. Obtener suscripciones
  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error(`[Push] Error fetching subs for user ${userId}:`, error);
    return { success: false, error: error.message };
  }

  if (!subs || subs.length === 0) {
    console.log(`[Push] Usuario ${userId} no tiene dispositivos registrados.`);
    return { success: true, sent: 0, total: 0 };
  }

  const payloadString = JSON.stringify(payload);
  let successCount = 0;

  // 2. Enviar a cada dispositivo
  await Promise.all(subs.map(async (sub: any) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, payloadString);
      successCount++;
    } catch (err: any) {
      console.error(`[Push] Error enviando a sub ${sub.id}:`, err.statusCode, err.message);
      
      // Borrar suscripción inválida (410 Gone / 404 Not Found)
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }));

  console.log(`[Push] Enviado a ${userId}: ${successCount}/${subs.length} éxitos.`);
  return { success: true, sent: successCount, total: subs.length };
};

// Exportar webpush configurado por si se necesita uso directo (ej. test)
export { webpush, initVapid };