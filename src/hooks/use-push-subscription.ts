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
        // Sincronización silenciosa en background
        updateSubscriptionInDb(subscription);
      } else {
        setIsSubscribed(false);
      }
    } catch (e) {
      console.error("Error checkSubscription:", e);
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
    if (!user) return false;
    setLoading(true);
    setError(null);

    // Validación iOS
    if (isIOS && !isStandalone) {
      setLoading(false);
      setError("En iOS, debes instalar la app en inicio para recibir notificaciones.");
      return false;
    }

    try {
      // 1. CRÍTICO: Pedir permiso PRIMERO, dentro del click del usuario.
      // Esto DEBE ser lo primero que sucede.
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        throw new Error("Permiso de notificaciones denegado.");
      }

      // 2. Solo si tenemos permiso, hacemos el fetch de la llave (Async)
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-public-key');
      
      if (keyError || !keyData?.publicKey) {
        throw new Error("Error obteniendo VAPID Public Key del servidor.");
      }

      // 3. Obtenemos el Service Worker activo
      const registration = await navigator.serviceWorker.ready;
      
      // 4. Convertimos llave y suscribimos
      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      // 5. Guardamos en BD
      await updateSubscriptionInDb(subscription);
      
      setIsSubscribed(true);
      return true;

    } catch (err: any) {
      console.error("Error subscribing:", err);
      setError(err.message || "Error desconocido al suscribirse.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // --- DIAGNÓSTICO PROFUNDO ---
  const runDiagnostics = async () => {
    const logs: string[] = [];
    const log = (msg: string) => { console.log(`[Diag] ${msg}`); logs.push(msg); };
    
    log("Iniciando diagnóstico...");
    
    try {
        if (!('serviceWorker' in navigator)) throw new Error("Service Worker no soportado");
        if (!('PushManager' in window)) throw new Error("PushManager no soportado");
        log("✅ Navegador soporta Push");

        const reg = await navigator.serviceWorker.ready;
        log(`✅ Service Worker activo (Scope: ${reg.scope})`);

        const sub = await reg.pushManager.getSubscription();
        if (!sub) throw new Error("❌ El navegador NO tiene una suscripción activa.");
        
        log("✅ Suscripción encontrada en navegador");
        const subJSON = sub.toJSON();
        
        const { data: dbSubs } = await supabase.from('push_subscriptions').select('*').eq('endpoint', sub.endpoint);
        if (dbSubs && dbSubs.length > 0) {
            log("✅ Suscripción sincronizada en Base de Datos");
        } else {
            log("⚠️ La suscripción no está en la BD. Intentando resincronizar...");
            await updateSubscriptionInDb(sub);
        }

        log("🚀 Enviando prueba directa...");
        
        const { data: testResult, error: testError } = await supabase.functions.invoke('send-push', {
            body: {
                title: "Diagnóstico",
                body: "Si lees esto, el sistema funciona.",
                direct_subscription: subJSON
            }
        });

        if (testError) {
            log(`❌ Error de red: ${testError.message}`);
        } else if (testResult.success) {
            log(`✅ ÉXITO TOTAL: Status ${testResult.statusCode}`);
        } else {
            log(`❌ FALLO DE ENVÍO: Status ${testResult.statusCode}`);
            log(`Error detalle: ${testResult.error}`);
        }

    } catch (e: any) {
        log(`❌ ERROR FATAL: ${e.message}`);
    }

    return logs;
  };

  return { 
    isSupported, isSubscribed, loading, error, 
    subscribeToPush, runDiagnostics, isIOS, isStandalone 
  };
}