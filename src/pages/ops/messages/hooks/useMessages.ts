import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { NOTIFICATIONS_QUERY_KEY } from "@/hooks/use-notifications";

export function useMessages() {
  const { user, profile, tenantId } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async (isBackground = false) => {
    if (!user || !tenantId) return;
    if (!isBackground) setLoading(true);

    try {
      // 1. RECIBIDOS (Inbox)
      const { data: receipts, error: rxError } = await supabase
        .from('message_receipts')
        .select(`
          id,
          leido_at,
          confirmado_at,
          messages (
            id, tipo, asunto, cuerpo, prioridad, requiere_confirmacion, created_at,
            profiles:created_by (nombre, apellido)
          )
        `)
        .eq('user_id', user.id)
        .order('messages(created_at)', { ascending: false });

      if (rxError) console.error("Error inbox:", rxError);

      const formattedMessages = receipts?.map((r: any) => ({
        unique_id: `msg_${r.id}`,
        receipt_id: r.id,
        source: 'message',
        ...r.messages,
        leido_at: r.leido_at,
        confirmado_at: r.confirmado_at,
        timestamp: new Date(r.messages.created_at).getTime()
      })) || [];

      // 2. NOTIFICACIONES
      const { data: notifications, error: notifError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .neq('type', 'message')
        .order('created_at', { ascending: false });

      if (notifError) console.error("Error notifications:", notifError);

      // Enriquecer notificaciones con datos de tareas si es necesario
      const taskIds = notifications
        ?.filter(n => n.type === 'routine_rejected' || n.type === 'routine_approved')
        .map(n => n.entity_id) || [];

      let tasksMap = new Map();
      if (taskIds.length > 0) {
        const { data: tasksInfo } = await supabase
          .from('task_instances')
          .select(`id, fecha_programada, pdv (nombre, ciudad), routine_templates (nombre)`)
          .in('id', taskIds);
        tasksInfo?.forEach(t => tasksMap.set(t.id, t));
      }

      const formattedNotifications = notifications?.map((n: any) => {
        const task = tasksMap.get(n.entity_id);
        let cuerpo = "Notificación del sistema.";
        let asunto = n.title;

        if (task) {
          if (n.type === 'routine_rejected') {
            cuerpo = `⚠️ **TAREA RECHAZADA**\n\n📍 **PDV:** ${task.pdv?.nombre} (${task.pdv?.ciudad})\n📋 **Rutina:** ${task.routine_templates?.nombre}\n📅 **Fecha:** ${task.fecha_programada}\n\nPor favor ve a "Mis Tareas" y revisa la nota del auditor para corregirla.`;
          } else if (n.type === 'routine_approved') {
            cuerpo = `✅ **TAREA APROBADA**\n\n📍 **PDV:** ${task.pdv?.nombre}\n📋 **Rutina:** ${task.routine_templates?.nombre}\n📅 **Fecha:** ${task.fecha_programada}`;
          }
        }

        return {
          unique_id: `notif_${n.id}`,
          receipt_id: n.id,
          source: 'notification',
          tipo: n.type,
          asunto: asunto,
          cuerpo: cuerpo,
          prioridad: n.type === 'routine_rejected' ? 'alta' : 'normal',
          requiere_confirmacion: false,
          created_at: n.created_at,
          leido_at: n.leido ? n.created_at : null,
          timestamp: new Date(n.created_at).getTime(),
          entity_id: n.entity_id
        };
      }) || [];

      const combinedInbox = [...formattedMessages, ...formattedNotifications];
      combinedInbox.sort((a, b) => b.timestamp - a.timestamp);
      setInboxMessages(combinedInbox);

      // 3. ENVIADOS (Sent)
      if (['director', 'lider', 'auditor', 'superadmin'].includes(profile?.role || '')) {
        const { data: sent } = await supabase
          .from('messages')
          .select(`*, message_receipts (id, leido_at)`)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });
        setSentMessages(sent || []);
      }

    } catch (err) {
      console.error(err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [user, profile, tenantId]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    fetchMessages(false);

    const channel = supabase
      .channel('inbox-unified-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_receipts', filter: `user_id=eq.${user.id}` }, () => fetchMessages(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => fetchMessages(true))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchMessages]);

  const markAsRead = async (uniqueId: string) => {
    const msg = inboxMessages.find(m => m.unique_id === uniqueId);
    if (!msg || msg.leido_at) return;

    const now = new Date().toISOString();
    setInboxMessages(prev => prev.map(m => m.unique_id === uniqueId ? { ...m, leido_at: now } : m));

    try {
      if (msg.source === 'message') {
        await supabase.from('message_receipts').update({ leido_at: now }).eq('id', msg.receipt_id);
      } else {
        await supabase.from('notifications').update({ leido: true }).eq('id', msg.receipt_id);
      }
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    } catch (err) {
      console.error("Error marking as read", err);
    }
  };

  const confirmReceipt = async (receiptId: string) => {
    const now = new Date().toISOString();
    setInboxMessages(prev => prev.map(m => 
      m.receipt_id === receiptId && m.source === 'message' ? { ...m, confirmado_at: now, leido_at: m.leido_at || now } : m
    ));
    
    try {
      await supabase.from('message_receipts').update({ confirmado_at: now, leido_at: now }).eq('id', receiptId);
      toast({ title: "Confirmado", description: "Recepción confirmada exitosamente." });
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo confirmar." });
    }
  };

  return {
    inboxMessages,
    sentMessages,
    loading,
    refreshMessages: () => fetchMessages(false),
    markAsRead,
    confirmReceipt
  };
}