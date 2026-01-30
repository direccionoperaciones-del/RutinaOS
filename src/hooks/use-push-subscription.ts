import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from './use-current-user';

// INTENTA LEER LA VARIABLE DE ENTORNO O USA UN PLACEHOLDER SEGURO
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ""; 

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

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
  const isConfigured = !!VAPID_PUBLIC_KEY;

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      checkSubscription();
    }
  }, [user]);

  const checkSubscription = async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setIsSubscribed(!!subscription);
  };

  const subscribeToPush = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      if (!isConfigured) {
        throw new Error("VAPID Public Key no configurada. Revisa VITE_VAPID_PUBLIC_KEY en .env");
      }

      const registration = await navigator.serviceWorker.ready;
      
      // 1. Pedir permiso al navegador (Nativo)
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permiso de notificaciones denegado');
      }

      // 2. Suscribirse al PushManager del navegador
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      // 3. Guardar en Supabase
      const subJSON = subscription.toJSON();
      
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subJSON.endpoint!,
          p256dh: subJSON.keys!.p256dh,
          auth: subJSON.keys!.auth,
          user_agent: navigator.userAgent
        }, { onConflict: 'user_id,endpoint' });

      if (dbError) throw dbError;

      setIsSubscribed(true);
      return true;

    } catch (err: any) {
      console.error('Error subscribing to push:', err);
      setError(err.message || 'Error al suscribirse');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const sendTestPush = async () => {
    if (!user) return;
    try {
      await supabase.functions.invoke('send-push', {
        body: {
          userId: user.id,
          title: "Prueba de Notificación 🔔",
          body: "¡Si ves esto, las notificaciones funcionan correctamente!",
          url: "/settings"
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  return {
    isSupported,
    isSubscribed,
    isConfigured,
    loading,
    error,
    subscribeToPush,
    sendTestPush
  };
}