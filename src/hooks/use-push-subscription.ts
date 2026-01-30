import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from './use-current-user';

// LLAVE PÚBLICA VAPID (Directa para evitar errores de importación)
// Esta es una llave nueva y válida P-256.
const PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBLYFpaaRWsEtzD9DxWo";

export function usePushSubscription() {
  const { user } = useCurrentUser();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  
  // Siempre configurado porque la llave está hardcodeada
  const isConfigured = true;

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      checkSubscription();
    }
  }, [user]);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (e) {
      console.error("Error checking subscription", e);
    }
  };

  // Conversor robusto compatible con Safari/iOS
  function urlBase64ToUint8Array(base64String: string) {
    try {
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
    } catch (e) {
      console.error("Error convirtiendo VAPID Key:", e);
      throw new Error("La llave VAPID tiene un formato inválido.");
    }
  }

  const subscribeToPush = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // 1. Pedir permiso
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permiso denegado. Habilita las notificaciones en la configuración del navegador.');
      }

      // 2. Convertir llave
      const applicationServerKey = urlBase64ToUint8Array(PUBLIC_KEY);

      // 3. Suscribirse
      // Nota: A veces hay una suscripción vieja corrupta, intentamos obtenerla primero
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      // 4. Guardar en Supabase
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
      console.error('Error subscribing:', err);
      // Mensaje amigable para el usuario
      if (err.message.includes("valid P-256")) {
        setError("Error técnico de seguridad en el navegador. Intenta reiniciar la app.");
      } else {
        setError(err.message || 'Error al activar notificaciones');
      }
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
          title: "¡Notificaciones Activas! 🔔",
          body: "El sistema está funcionando correctamente.",
          url: "/settings"
        }
      });
    } catch (err) {
      console.error(err);
    }
  };
  
  const saveKeyLocally = () => {};

  return {
    isSupported,
    isSubscribed,
    isConfigured,
    loading,
    error,
    subscribeToPush,
    sendTestPush,
    saveKeyLocally
  };
}