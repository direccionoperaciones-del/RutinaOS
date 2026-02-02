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
      // 1. Permiso INMEDIATO (User Gesture)
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error("Permiso denegado.");

      // 2. Obtener llave
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-public-key');
      if (keyError || !keyData?.publicKey) throw new Error("Error obteniendo VAPID Public Key.");

      // 3. Suscribir
      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      const registration = await navigator.serviceWorker.ready;
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      // 4. Guardar
      await updateSubscriptionInDb(subscription);
      
      setIsSubscribed(true);
      return true;

    } catch (err: any) {
      console.error("Error subscribing:", err);
      setError(err.message || "Error al suscribirse.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const runDiagnostics = async () => {
    const logs: string[] = [];
    const log = (msg: string) => { console.log(`[Diag] ${msg}`); logs.push(msg); };
    
    log("=== INICIANDO DIAGNÓSTICO PUSH ===");
    
    try {
        if (!('serviceWorker' in navigator)) throw new Error("SW no soportado");
        if (!('PushManager' in window)) throw new Error("PushManager no soportado");
        
        const reg = await navigator.serviceWorker.ready;
        log(`✅ SW Activo. Scope: ${reg.scope}`);

        const sub = await reg.pushManager.getSubscription();
        if (!sub) throw new Error("❌ Sin suscripción en navegador. Activa notificaciones primero.");
        
        log("✅ Suscripción detectada en navegador.");
        
        // PRUEBA DE ENVÍO REAL
        log("🚀 Enviando prueba directa a Edge Function...");
        
        const { data: result, error: netError } = await supabase.functions.invoke('send-push', {
            body: {
                title: "Diagnóstico",
                body: "Prueba de envío directo con validación de estado.",
                direct_subscription: sub.toJSON()
            }
        });

        if (netError) {
            log(`❌ Error de Red: ${netError.message}`);
            return logs;
        }

        // ANÁLISIS DE RESULTADOS
        if (result.results && result.results.length > 0) {
            const res = result.results[0];
            log(`📡 Respuesta Proveedor: Status ${res.status}`);
            
            if (res.success && (res.status === 201 || res.status === 200)) {
                log("✅ ÉXITO: El proveedor aceptó la notificación.");
                log("ℹ️ Si no la ves, revisa 'No Molestar' o permisos del SO.");
            } else {
                log(`❌ FALLO REAL: El proveedor rechazó el envío.`);
                log(`🔍 Error: ${res.error || 'Desconocido'}`);
                
                if (res.status === 410 || res.status === 404) {
                    log("🗑️ Diagnóstico: Suscripción caducada (Gone). Se requiere resuscribir.");
                } else if (res.status === 401) {
                    log("🔑 Diagnóstico: Llaves VAPID inválidas en backend.");
                }
            }
        } else {
            log("⚠️ Respuesta inesperada del backend (sin resultados).");
        }

    } catch (e: any) {
        log(`❌ ERROR CRÍTICO: ${e.message}`);
    }

    return logs;
  };

  return { 
    isSupported, isSubscribed, loading, error, 
    subscribeToPush, runDiagnostics, isIOS, isStandalone 
  };
}