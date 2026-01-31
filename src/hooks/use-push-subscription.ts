import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from './use-current-user';

// Función obligatoria para convertir la llave VAPID de base64url a Uint8Array
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
      }
    } catch (e) {
      console.error("Error checking subscription", e);
    }
  };

  const subscribeToPush = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    // VALIDACIÓN IOS PWA
    if (isIOS && !isStandalone) {
      setLoading(false);
      setError("En iOS, debes instalar la aplicación en tu pantalla de inicio para activar las notificaciones. Toca 'Compartir' -> 'Agregar a inicio'.");
      return false;
    }

    try {
      // 1. OBTENER LLAVE PÚBLICA DEL SERVIDOR (Dinámico)
      console.log("Obteniendo llave VAPID del servidor...");
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-public-key');
      
      if (keyError || !keyData?.publicKey) {
        throw new Error("No se pudo obtener la configuración de notificaciones del servidor. Verifica los Secretos en Supabase.");
      }

      // LIMPIEZA DE LLAVE: Eliminar espacios y comillas accidentales
      const vapidPublicKey = keyData.publicKey.trim().replace(/['"]/g, '');
      console.log("Llave recibida (sanitizada):", vapidPublicKey);

      if (vapidPublicKey.length < 10) {
         throw new Error("La llave pública parece estar vacía o corrupta.");
      }

      // 2. REGISTRO SERVICE WORKER
      console.log("Registrando Service Worker...");
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      // 3. SUSCRIPCIÓN PUSH
      let applicationServerKey;
      try {
        applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      } catch (e) {
        console.error("Error convirtiendo llave:", e);
        throw new Error("La llave pública VAPID tiene un formato incorrecto (Base64URL inválido).");
      }
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      // 4. GUARDAR EN SUPABASE
      const subJSON = subscription.toJSON();
      
      if (!subJSON.keys?.p256dh || !subJSON.keys?.auth || !subJSON.endpoint) {
        throw new Error("Suscripción incompleta (faltan llaves p256dh/auth)");
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
      
      let msg = err.message || "Error desconocido al suscribir";
      
      // Diagnóstico detallado para el usuario
      if (msg.includes("valid P-256")) {
        msg = "Error: La llave VAPID en Supabase es incorrecta. Asegúrate de copiar la 'Public Key' generada (no la privada) y sin comillas.";
      }
      if (msg.includes("user denied")) {
        msg = "Permiso de notificaciones denegado. Habilítalo en la configuración del navegador (candado en la barra de URL).";
      }
      
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