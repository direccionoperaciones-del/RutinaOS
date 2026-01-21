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

  // 1. Query principal para obtener el conteo
  const { data: unreadCount = 0, refetch } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('leido', false);
      
      if (error) {
        console.error("Error fetching notifications:", error);
        return 0;
      }
      return count || 0;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutos de caché si no hay eventos
  });

  // 2. Suscripción a cambios en tiempo real (INSERT/UPDATE/DELETE)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // Invalidar query para forzar recarga del contador
          queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });

          // Si es un mensaje nuevo, mostrar toast
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as any;
            toast({
              title: "Nuevo Mensaje",
              description: newNotif.title,
            });
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