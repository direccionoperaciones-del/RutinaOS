import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";

export function useNotifications() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);

  // 1. Solicitar permisos al navegador al montar
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  // 2. Cargar conteo inicial y suscribirse
  useEffect(() => {
    if (!user) return;

    // Cargar inicial
    const fetchCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('leido', false);
      
      setUnreadCount(count || 0);
    };

    fetchCount();

    // Suscripción Realtime
    const channel = supabase
      .channel('public:notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // Nueva notificación recibida
          const newNotif = payload.new as any;
          setUnreadCount((prev) => prev + 1);

          // Alerta visual dentro de la app (Toast)
          toast({
            title: "Nuevo Mensaje",
            description: newNotif.title,
          });

          // Alerta nativa del navegador (si el usuario no está viendo la pestaña)
          if (document.hidden && Notification.permission === "granted") {
            new Notification("Nueva Notificación - Operaciones", {
              body: newNotif.title,
              icon: "/favicon.ico" // Ajustar si tienes icono
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

  return { unreadCount };
}