import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";

export const NOTIFICATIONS_QUERY_KEY = ['notifications-count'];

export function useNotifications() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 1. Query principal (Estado base)
  const { data: unreadCount = 0, refetch } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('leido', false);
      
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user,
  });

  // 2. Suscripción Realtime Inteligente
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('realtime-notifications-global')
      .on(
        'postgres_changes',
        {
          event: '*', // Escuchar todo (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // --- Lógica Optimista ---
          
          // Caso 1: Nuevo mensaje (Incrementar)
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as any;
            
            // Actualizar caché inmediatamente
            queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, (old: number = 0) => old + 1);
            
            // Mostrar alerta visual
            toast({
              title: "Nuevo Mensaje",
              description: newNotif.title || "Has recibido una notificación",
            });
          } 
          
          // Caso 2: Mensaje leído/borrado (Decrementar o Recalcular)
          else if (
            (payload.eventType === 'UPDATE' && payload.new.leido === true) || 
            payload.eventType === 'DELETE'
          ) {
            // Invalida para asegurar el número exacto real desde BD
            queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient, toast]);

  return { unreadCount, refreshNotifications: refetch };
}