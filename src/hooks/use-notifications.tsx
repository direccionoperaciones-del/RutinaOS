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

  // 1. Query principal (Estado base unificado)
  const { data: unreadCount = 0, refetch } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      if (!user) return 0;
      
      // Contar notificaciones de sistema no leídas
      const { count: sysCount, error: sysError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('leido', false);
      
      // Contar mensajes directos no leídos
      const { count: msgCount, error: msgError } = await supabase
        .from('message_receipts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('leido_at', null);

      if (sysError || msgError) return 0;
      
      return (sysCount || 0) + (msgCount || 0);
    },
    enabled: !!user,
    refetchInterval: 30000, // Polling de seguridad cada 30s
  });

  // 2. Suscripción Realtime Unificada
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('realtime-global-badges')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_receipts', filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return { unreadCount, refreshNotifications: refetch };
}