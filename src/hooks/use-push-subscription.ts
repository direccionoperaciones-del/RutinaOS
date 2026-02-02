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

    if (isIOS && !isStandalone) {
      setLoading(false);
      setError("En iOS, debes instalar la app en inicio para recibir notificaciones.");
      return false;
    }

    try {
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-public-key');
      if (keyError || !keyData?.publicKey) throw new Error("Error obteniendo VAPID Public Key.");

      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      const registration = await navigator.serviceWorker.ready;
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      await updateSubscriptionInDb(subscription);
      setIsSubscribed(true);
      return true;
    } catch (err: any) {
      console.error("Error subscribing:", err);
      setError(err.message);
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
        // 1. Verificar Soporte
        if (!('serviceWorker' in navigator)) throw new Error("Service Worker no soportado");
        if (!('PushManager' in window)) throw new Error("PushManager no soportado");
        log("✅ Navegador soporta Push");

        // 2. Verificar SW Activo
        const reg = await navigator.serviceWorker.ready;
        log(`✅ Service Worker activo (Scope: ${reg.scope})`);

        // 3. Obtener Suscripción del Navegador
        const sub = await reg.pushManager.getSubscription();
        if (!sub) throw new Error("❌ El navegador NO tiene una suscripción activa. Dale click a 'Activar'.");
        
        log("✅ Suscripción encontrada en navegador");
        const subJSON = sub.toJSON();
        
        // 4. Verificar DB
        const { data: dbSubs } = await supabase.from('push_subscriptions').select('*').eq('endpoint', sub.endpoint);
        if (dbSubs && dbSubs.length > 0) {
            log("✅ Suscripción sincronizada en Base de Datos");
        } else {
            log("⚠️ La suscripción no está en la BD. Intentando resincronizar...");
            await updateSubscriptionInDb(sub);
        }

        // 5. PRUEBA DE FUEGO: Envío directo usando el JSON del navegador
        log("🚀 Enviando prueba directa a Edge Function...");
        
        const { data: testResult, error: testError } = await supabase.functions.invoke('send-push', {
            body: {
                title: "Diagnóstico",
                body: "Si lees esto, el sistema funciona.",
                direct_subscription: subJSON // Enviamos el objeto crudo
            }
        });

        if (testError) {
            log(`❌ Error de red al contactar Edge Function: ${testError.message}`);
        } else if (testResult.success) {
            log(`✅ ÉXITO TOTAL: Servidor respondió Status ${testResult.statusCode}`);
            log("👉 Si no ves la notificación, revisa si tienes 'No Molestar' activo o permisos de SO bloqueados.");
        } else {
            log(`❌ FALLO DE ENVÍO: Servidor respondió Status ${testResult.statusCode}`);
            log(`Error detalle: ${testResult.error}`);
            
            if (testResult.statusCode === 401 || testResult.statusCode === 403) {
                log("💡 DIAGNÓSTICO: Las llaves VAPID cambiaron. Debes resetear.");
            } else if (testResult.statusCode === 410) {
                log("💡 DIAGNÓSTICO: La suscripción caducó. Debes resetear.");
            }
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