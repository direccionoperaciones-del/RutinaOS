import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from './use-current-user';

// NOTA: Esta llave debe coincidir con la VAPID_PRIVATE_KEY en las variables de entorno de Edge Functions.
// Genera un par nuevo con: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBLYFpaaRWsEtzD9DxWo";

// 1. UTILIDAD DE CONVERSIÓN OBLIGATORIA
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
    // Detectar soporte y entorno
    const hasSW = 'serviceWorker' in navigator;
    const hasPush = 'PushManager' in window;
    setIsSupported(hasSW && hasPush);

    // Detectar iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Detectar Standalone (PWA instalada)
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
        // Opcional: Sincronizar con DB si es necesario
      }
    } catch (e) {
      console.error("Error checking subscription", e);
    }
  };

  const subscribeToPush = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    // 2. VALIDACIÓN IOS PWA
    if (isIOS && !isStandalone) {
      setLoading(false);
      setError("En iOS, debes instalar la aplicación en tu pantalla de inicio para activar las notificaciones. Toca 'Compartir' -> 'Agregar a inicio'.");
      return false;
    }

    try {
      // 3. REGISTRO SERVICE WORKER
      console.log("Registrando SW...");
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready; // Esperar a que esté listo

      // 4. SUSCRIPCIÓN PUSH
      console.log("Solicitando suscripción push...");
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      console.log("PushSubscription obtenida:", subscription);

      // 5. GUARDAR EN SUPABASE
      const subJSON = subscription.toJSON();
      
      if (!subJSON.keys?.p256dh || !subJSON.keys?.auth || !subJSON.endpoint) {
        throw new Error("Suscripción incompleta (faltan llaves)");
      }

      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subJSON.endpoint,
          p256dh: subJSON.keys.p256dh,
          auth: subJSON.keys.auth,
          user_agent: navigator.userAgent
        }, { onConflict: 'endpoint' });

      if (dbError) throw dbError;

      setIsSubscribed(true);
      return true;

    } catch (err: any) {
      console.error("PUSH SUBSCRIBE FAILED:", err);
      // Extraer mensaje real del error
      let msg = err.message || "Error desconocido al suscribir";
      if (msg.includes("valid P-256")) msg = "Error de configuración VAPID (Clave pública inválida).";
      
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
      const { error } = await supabase.functions.invoke('send-push', {
        body: {
          userId: user.id,
          title: "🔔 Prueba Exitosa",
          body: "El sistema de notificaciones está funcionando correctamente.",
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

  return {
    isSupported,
    isSubscribed,
    loading,
    error,
    subscribeToPush,
    sendTestPush,
    isIOS,
    isStandalone
  };
}