import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";

export function useNotifications() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);

  // Función para obtener el conteo actual desde la base de datos
  const fetchCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('leido', false);
    
    setUnreadCount(count || 0);
  }, [user]);

  // 1. Cargar conteo inicial
  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // 2. Suscripción Realtime
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('public:notifications')
      .on(
        'postgres_changes',
        {
          event: '*', // ✅ Escuchar INSERT, UPDATE y DELETE
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // Si es un mensaje nuevo, mostramos el toast
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as any;
            toast({
              title: "Nuevo Mensaje",
              description: newNotif.title,
            });
          }

          // ✅ Siempre refrescamos el contador para asegurar consistencia
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchCount, toast]);

  return { unreadCount, refreshNotifications: fetchCount };
}