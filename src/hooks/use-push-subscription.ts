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

  const updateSubscriptionInDb = async (subscription: PushSubscription) => {
    if (!user) return { error: "No user" };
    const subJSON = subscription.toJSON();
    
    if (subJSON.keys?.p256dh && subJSON.keys?.auth && subJSON.endpoint) {
       return await supabase.from('push_subscriptions').upsert({
          user_id: user.id,
          endpoint: subJSON.endpoint,
          p256dh: subJSON.keys.p256dh,
          auth: subJSON.keys.auth,
          user_agent: navigator.userAgent,
          last_used_at: new Date().toISOString()
       }, { onConflict: 'endpoint' });
    }
    return { error: "Invalid keys" };
  };

  const checkSubscriptionState = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        setIsSubscribed(true);
        // Sincronización silenciosa al cargar
        updateSubscriptionInDb(subscription);
      } else {
        setIsSubscribed(false);
      }
    } catch (e) {
      console.error("[PushHook] Error checkSubscription:", e);
    }
  };

  const subscribeToPush = async () => {
    if (!user) return false;
    setLoading(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error("Permiso denegado.");

      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-public-key');
      if (keyError || !keyData?.publicKey) throw new Error("Error obteniendo llave pública.");

      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      const registration = await navigator.serviceWorker.ready;
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      const { error: dbError } = await updateSubscriptionInDb(subscription);
      if (dbError) console.error("Error guardando suscripción:", dbError);
      
      setIsSubscribed(true);
      return true;

    } catch (err: any) {
      console.error("[PushHook] Error:", err);
      setError(err.message || "Error al suscribirse.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // --- DIAGNÓSTICO MEJORADO ---
  const runDiagnostics = async () => {
    const logs: string[] = [];
    const log = (msg: string) => { logs.push(msg); }; // Solo guarda en array para UI
    
    log("=== DIAGNÓSTICO V3 (DB CHECK) ===");
    
    try {
        if (!('serviceWorker' in navigator)) throw new Error("Sin soporte SW");
        
        const reg = await navigator.serviceWorker.ready;
        log(`✅ SW Estado: ${reg.active ? 'Activo' : 'Inactivo'}`);
        
        const sub = await reg.pushManager.getSubscription();
        if (!sub) throw new Error("❌ Sin suscripción local. Actívala primero.");
        
        log("✅ Suscripción navegador OK.");

        // 1. INTENTO DE GUARDADO EN DB CON REPORTE
        log("💾 Sincronizando con Supabase...");
        const { error: dbError } = await updateSubscriptionInDb(sub);
        
        if (dbError) {
            log(`❌ ERROR DB: ${dbError.message || dbError}`);
            log("⚠️ Faltan políticas RLS en tabla push_subscriptions.");
            return logs; // Detener si falla la DB
        } else {
            log("✅ DB Sincronizada (RLS Correcto).");
        }

        // 2. PRUEBA DE ENVÍO
        log("🚀 Enviando prueba...");
        const { data: { session } } = await supabase.auth.getSession();
        
        const PROJECT_URL = "https://lrnzxrrjcwkmwwldfdaq.supabase.co";
        const functionUrl = `${PROJECT_URL}/functions/v1/send-push`;

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({
                user_id: user?.id,
                title: "Test Exitoso",
                body: "Conexión DB <-> Navegador establecida.",
                url: "/settings?success=true"
            })
        });

        const jsonResult = await response.json();
        
        if (jsonResult.success && jsonResult.sent > 0) {
            log(`✅ ENVÍO EXITOSO (Sent: ${jsonResult.sent})`);
        } else {
            log(`⚠️ Backend respondió: ${JSON.stringify(jsonResult)}`);
        }

    } catch (e: any) {
        log(`❌ CRITICAL: ${e.message}`);
    }

    return logs;
  };

  return { 
    isSupported, isSubscribed, loading, error, 
    subscribeToPush, runDiagnostics, isIOS, isStandalone 
  };
}