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

    // Verificar estado del Service Worker
    if (hasSW) {
        navigator.serviceWorker.ready.then(reg => {
            console.log("[PushHook] SW Ready. Active:", !!reg.active);
            if (!navigator.serviceWorker.controller) {
                console.warn("[PushHook] ⚠️ SW registrado pero NO controla la página todavía (Hard Reload necesario?).");
            }
        });
    }

    if (hasSW && hasPush && user) {
      checkSubscriptionState();
    }
  }, [user]);

  const checkSubscriptionState = async () => {
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
      console.error("[PushHook] Error checkSubscription:", e);
    }
  };

  const updateSubscriptionInDb = async (subscription: PushSubscription) => {
    if (!user) return;
    const subJSON = subscription.toJSON();
    
    // Validación estricta antes de guardar
    if (subJSON.keys?.p256dh && subJSON.keys?.auth && subJSON.endpoint) {
       console.log("[PushHook] Actualizando suscripción en DB...");
       await supabase.from('push_subscriptions').upsert({
          user_id: user.id,
          endpoint: subJSON.endpoint,
          p256dh: subJSON.keys.p256dh,
          auth: subJSON.keys.auth,
          last_used_at: new Date().toISOString()
       }, { onConflict: 'endpoint' });
    } else {
        console.error("[PushHook] Suscripción inválida (faltan keys):", subJSON);
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
      console.log("[PushHook] Solicitando permiso...");
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error("Permiso denegado por el usuario.");

      console.log("[PushHook] Obteniendo VAPID Key...");
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-public-key');
      if (keyError || !keyData?.publicKey) throw new Error("Error obteniendo VAPID Public Key.");

      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      const registration = await navigator.serviceWorker.ready;
      
      console.log("[PushHook] Suscribiendo en navegador...");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      console.log("[PushHook] Suscripción exitosa. Guardando...");
      await updateSubscriptionInDb(subscription);
      
      setIsSubscribed(true);
      return true;

    } catch (err: any) {
      console.error("[PushHook] Error subscribing:", err);
      setError(err.message || "Error al suscribirse.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const runDiagnostics = async () => {
    const logs: string[] = [];
    const log = (msg: string) => { console.log(`[Diag] ${msg}`); logs.push(msg); };
    
    log("=== DIAGNÓSTICO PUSH V2 ===");
    
    try {
        // 1. Chequeo de SW
        if (!('serviceWorker' in navigator)) throw new Error("Navegador no soporta SW");
        const reg = await navigator.serviceWorker.ready;
        log(`✅ SW Estado: ${reg.active ? 'Activo' : 'Inactivo'}`);
        
        if (!navigator.serviceWorker.controller) {
            log("⚠️ ALERTA: SW no controla la página. Recarga forzada recomendada.");
        }

        // 2. Chequeo de Suscripción
        const sub = await reg.pushManager.getSubscription();
        if (!sub) throw new Error("❌ Sin suscripción activa en navegador.");
        
        log("✅ Suscripción local detectada.");
        const subJson = sub.toJSON();
        if(!subJson.keys?.auth) log("❌ Suscripción corrupta (sin auth key).");

        // 3. Prueba de Envío
        log("🚀 Enviando prueba al Backend...");
        
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Sin sesión Supabase");

        const PROJECT_URL = "https://lrnzxrrjcwkmwwldfdaq.supabase.co";
        const functionUrl = `${PROJECT_URL}/functions/v1/send-push`;

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                user_id: user?.id,
                title: "Test Diagnóstico",
                body: "Si ves esto, el sistema funciona.",
                url: "/settings?test=true"
            })
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Error HTTP ${response.status}: ${txt}`);
        }

        const jsonResult = await response.json();
        log(`📡 Respuesta Backend: ${JSON.stringify(jsonResult)}`);

        if (jsonResult.success && jsonResult.sent > 0) {
            log("✅ Backend reporta ENVÍO EXITOSO a FCM/Push Service.");
            log("👀 Si no aparece visualmente, verifica:");
            log("   1. 'No molestar' desactivado.");
            log("   2. Permisos de notif. del SO.");
            log("   3. Que el navegador no esté silenciado.");
        } else {
            log("⚠️ Backend reporta fallo en envío (suscripción inválida?).");
        }

    } catch (e: any) {
        log(`❌ ERROR: ${e.message}`);
    }

    return logs;
  };

  return { 
    isSupported, isSubscribed, loading, error, 
    subscribeToPush, runDiagnostics, isIOS, isStandalone 
  };
}