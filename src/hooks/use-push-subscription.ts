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
        // Sincronización silenciosa
        updateSubscriptionInDb(subscription);
      } else {
        setIsSubscribed(false);
      }
    } catch (e) {
      console.warn("[PushHook] No se pudo verificar suscripción:", e);
    }
  };

  const subscribeToPush = async () => {
    if (!user) return false;
    setLoading(true);
    setError(null);

    try {
      // 1. Pedir permisos explícitamente
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error("Permiso de notificaciones denegado.");

      // 2. Obtener VAPID key
      const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-public-key');
      if (keyError || !keyData?.publicKey) throw new Error("No se pudo obtener la configuración del servidor (VAPID).");

      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      
      // 3. Obtener SW y Suscribir
      const registration = await navigator.serviceWorker.ready;
      
      // Limpiar suscripción vieja para evitar problemas de caché de token
      const oldSub = await registration.pushManager.getSubscription();
      if (oldSub) await oldSub.unsubscribe();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      // 4. Guardar en DB
      const { error: dbError } = await updateSubscriptionInDb(subscription);
      if (dbError) throw dbError;
      
      setIsSubscribed(true);
      return true;

    } catch (err: any) {
      console.error("[PushHook] Error:", err);
      setError(err.message || "Error al activar las notificaciones.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const runDiagnostics = async () => {
    const logs: string[] = [];
    const log = (msg: string) => { logs.push(msg); };
    
    log("=== DIAGNÓSTICO AVANZADO ===");
    
    try {
        log(`📍 Navegador: ${navigator.userAgent.slice(0, 50)}...`);
        log(`📍 Contexto Seguro: ${window.isSecureContext ? 'SÍ' : 'NO'}`);
        log(`📍 Permiso Actual: ${Notification.permission}`);

        if (!('serviceWorker' in navigator)) throw new Error("Sin soporte SW.");
        
        const reg = await navigator.serviceWorker.ready;
        log(`✅ SW Estado: ${reg.active ? 'Activo' : 'Inactivo'}`);
        
        const sub = await reg.pushManager.getSubscription();
        if (!sub) {
          log("❌ Sin suscripción local.");
          log("💡 Debes hacer clic en 'Activar Notificaciones' primero.");
          return logs;
        }
        
        log("✅ Suscripción local detectada.");

        log("🔑 Verificando VAPID en servidor...");
        const { data: keyData, error: keyError } = await supabase.functions.invoke('get-vapid-public-key');
        if (keyError || !keyData?.publicKey) {
          log(`❌ ERROR VAPID: ${keyError?.message || 'Llave vacía'}`);
          return logs;
        }
        log("✅ Configuración VAPID correcta.");

        log("💾 Sincronizando con base de datos...");
        const { error: dbError } = await updateSubscriptionInDb(sub);
        
        if (dbError) {
            log(`❌ ERROR DB: ${(dbError as any).message || JSON.stringify(dbError)}`);
            return logs;
        }
        log("✅ Base de datos sincronizada.");

        log("🚀 Enviando prueba de push...");
        const { data, error } = await supabase.functions.invoke('send-push', {
            body: {
                user_id: user?.id,
                title: "Test de Conexión",
                body: "¡Las notificaciones funcionan correctamente!",
                url: "/settings"
            }
        });

        if (error) throw error;
        
        if (data.success && data.sent > 0) {
            log(`✅ ENVÍO EXITOSO (Recibido por ${data.sent} dispositivo/s)`);
        } else {
            log(`⚠️ El servidor aceptó la petición pero Wompi/Google rechazó el envío (Token inválido o expirado).`);
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