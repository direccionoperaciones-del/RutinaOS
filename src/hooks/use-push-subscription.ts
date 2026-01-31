import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from './use-current-user';

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSubscription() {
  const { user } = useCurrentUser();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const hasSW = 'serviceWorker' in navigator;
    const hasPush = 'PushManager' in window;
    setIsSupported(hasSW && hasPush);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const isStand = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(isStand);

    if (hasSW && hasPush && user) {
      checkSubscription();
    }
  }, [user]);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        setIsSubscribed(true);
        // Opcional: Actualizar en BD en segundo plano para mantener vivo
        updateSubscriptionInDb(subscription);
      }
    } catch (e) {
      console.error("Error checking subscription", e);
    }
  };

  const updateSubscriptionInDb = async (subscription: PushSubscription) => {
    if (!user) return;
    const subJSON = subscription.toJSON();
    if (subJSON.keys?.p256dh && subJSON.keys?.auth && subJSON.endpoint) {
       await supabase.from('push_subscriptions').upsert({
          user_id: user.id,
          endpoint: subJSON.endpoint,
          p256dh: subJSON.keys.p256dh,
          auth: subJSON.keys.auth,
          last_used_at: new Date().toISOString()
       }, { onConflict: 'endpoint' });
    }
  };

  const subscribeToPush = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    if (isIOS && !isStandalone) {
      setLoading(false);
      setError("En iOS, debes instalar la app en inicio para recibir notificaciones.");
      return false;
    }

    try {
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-public-key');
      if (keyError || !keyData?.publicKey) throw new Error("Error obteniendo llave pública VAPID.");

      const vapidPublicKey = keyData.publicKey.trim().replace(/['"]/g, '');
      const registration = await navigator.serviceWorker.ready;
      
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      
      // Intentar suscribir
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      await updateSubscriptionInDb(subscription);

      setIsSubscribed(true);
      return true;

    } catch (err: any) {
      console.error("PUSH SUBSCRIBE FAILED:", err);
      let msg = err.message || "Error al suscribir";
      if (msg.includes("user denied")) msg = "Permiso denegado. Habilita notificaciones en el navegador.";
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const sendTestPush = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      // Usar invoke normal aquí (Usuario llamando a función)
      const { error } = await supabase.functions.invoke('send-push', {
        body: {
          user_id: user.id, // CORREGIDO: user_id en lugar de userId
          title: "🔔 Prueba Exitosa",
          body: "Sistema operativo y conectado.",
          url: "/settings"
        }
      });
      if (error) throw error;
    } catch (err: any) {
      console.error("Error sending test push:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { isSupported, isSubscribed, loading, error, subscribeToPush, sendTestPush, isIOS, isStandalone };
}