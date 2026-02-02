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
        // Actualizar en BD en background para mantener vivo el token
        updateSubscriptionInDb(subscription);
      }
    } catch (e) {
      console.error("Error verificando suscripción:", e);
    }
  };

  const updateSubscriptionInDb = async (subscription: PushSubscription) => {
    if (!user) return;
    const subJSON = subscription.toJSON();
    
    if (subJSON.keys?.p256dh && subJSON.keys?.auth && subJSON.endpoint) {
       const { error } = await supabase.from('push_subscriptions').upsert({
          user_id: user.id,
          endpoint: subJSON.endpoint,
          p256dh: subJSON.keys.p256dh,
          auth: subJSON.keys.auth,
          last_used_at: new Date().toISOString()
       }, { onConflict: 'endpoint' });
       
       if (error) console.error("Error guardando suscripción en DB:", error);
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
      // 1. Obtener llave pública
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-public-key');
      if (keyError) throw new Error(`Error obteniendo llave VAPID: ${keyError.message}`);
      if (!keyData?.publicKey) throw new Error("El servidor no devolvió una llave pública.");

      const vapidPublicKey = keyData.publicKey.trim().replace(/['"]/g, '');
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      
      const registration = await navigator.serviceWorker.ready;
      
      // 2. Intentar suscribir en el navegador
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      // 3. Guardar en BD
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
      
      // Llamada directa simple, sin anidar en 'body' extra
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          user_id: user.id,
          title: "🔔 Prueba Exitosa",
          body: "Tu dispositivo está conectado correctamente al sistema de alertas.",
          url: "/settings"
        }
      });

      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      
      return true;
    } catch (err: any) {
      console.error("Error enviando push de prueba:", err);
      setError(err.message || "Error de conexión con el servidor de notificaciones.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { isSupported, isSubscribed, loading, error, subscribeToPush, sendTestPush, isIOS, isStandalone };
}