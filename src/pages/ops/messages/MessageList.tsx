import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { 
  Bell, Check, Clock, Mail, MessageSquare, Megaphone, 
  AlertCircle, Send, CheckCheck, Eye, ShieldAlert, ShieldCheck,
  Filter, Calendar as CalendarIcon, X
} from "lucide-react";
import { format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { NewMessageModal } from "./NewMessageModal";
import { useCurrentUser } from "@/hooks/use-current-user";
import { NOTIFICATIONS_QUERY_KEY } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

export default function MessageList() {
  const { toast } = useToast();
  const { user, profile } = useCurrentUser();
  const queryClient = useQueryClient();
  
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  
  // Estado para controlar qué acordeón está abierto
  const [openedItem, setOpenedItem] = useState<string | undefined>(undefined);
  
  const [readDetailsOpen, setReadDetailsOpen] = useState(false);
  const [selectedSentMessage, setSelectedSentMessage] = useState<any>(null);
  const [readReceiptsDetail, setReadReceiptsDetail] = useState<any[]>([]);

  // --- NUEVOS FILTROS ---
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);

  // Función de carga de datos
  const fetchMessages = async (isBackground = false) => {
    if (!user) return;
    if (!isBackground) setLoading(true);
    
    try {
      // 1. RECIBIDOS
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
        .order('created_at', { ascending: false });

      if (notifError) console.error("Error notifications:", notifError);

      const taskIds = notifications
        ?.filter(n => n.type === 'routine_rejected' || n.type === 'routine_approved')
        .map(n => n.entity_id) || [];
      
      let tasksMap = new Map();
      if (taskIds.length > 0) {
        const { data: tasksInfo } = await supabase
          .from('task_instances')
          .select(`
            id, 
            fecha_programada, 
            pdv (nombre, ciudad), 
            routine_templates (nombre)
          `)
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
        } else if (n.type === 'routine_rejected') {
          cuerpo = "Tu tarea ha sido rechazada. Revisa el módulo de Mis Tareas para más detalles.";
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
      
      // 3. UNIFICAR
      const combinedInbox = [...formattedMessages, ...formattedNotifications];
      combinedInbox.sort((a, b) => b.timestamp - a.timestamp);
      
      setInboxMessages(combinedInbox);

      // 4. ENVIADOS
      if (['director', 'lider', 'auditor'].includes(profile?.role || '')) {
        const { data: sent } = await supabase
          .from('messages')
          .select(`*, message_receipts (id, leido_at)`)
          .eq('created_by', user.id)
          .order('created_at', { ascending: false });
          
        setSentMessages(sent || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages(false);
  }, [user, profile]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('inbox-unified-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_receipts', filter: `user_id=eq.${user.id}` }, () => fetchMessages(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => fetchMessages(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleOpenMessage = async (val: string) => {
    setOpenedItem(val);
    if (!val) return;

    const msg = inboxMessages.find(m => m.unique_id === val);
    if (!msg || msg.leido_at) return;

    const now = new Date().toISOString();
    setInboxMessages(prev => prev.map(m => 
      m.unique_id === val ? { ...m, leido_at: now } : m
    ));

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

  const handleConfirm = async (receiptId: string) => {
    const now = new Date().toISOString();
    setInboxMessages(prev => prev.map(m => 
      m.receipt_id === receiptId && m.source === 'message' ? { ...m, confirmado_at: now, leido_at: m.leido_at || now } : m
    ));
    await supabase.from('message_receipts').update({ confirmado_at: now, leido_at: now }).eq('id', receiptId);
    toast({ title: "Confirmado", description: "Recepción confirmada exitosamente." });
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
  };

  const viewReadDetails = async (msg: any) => {
    setSelectedSentMessage(msg);
    setReadReceiptsDetail([]);
    setReadDetailsOpen(true);
    const { data } = await supabase.from('message_receipts').select(`leido_at, confirmado_at, profiles (nombre, apellido, email)`).eq('message_id', msg.id);
    if (data) setReadReceiptsDetail(data);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'tarea_flash': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'comunicado': return <Megaphone className="w-5 h-5 text-blue-500" />;
      case 'routine_rejected': return <ShieldAlert className="w-5 h-5 text-red-600" />;
      case 'routine_approved': return <ShieldCheck className="w-5 h-5 text-green-600" />;
      default: return <MessageSquare className="w-5 h-5 text-gray-500" />;
    }
  };

  const canCreate = ['director', 'lider'].includes(profile?.role || '');

  // --- LÓGICA DE FILTRADO ---
  const filteredInbox = inboxMessages.filter(msg => {
    // Filtro Tipo
    if (filterType !== 'all') {
      if (filterType === 'comunicado' && msg.tipo !== 'comunicado') return false;
      if (filterType === 'mensaje' && msg.tipo !== 'mensaje') return false;
      if (filterType === 'sistema' && (msg.source === 'message' || msg.tipo === 'comunicado' || msg.tipo === 'mensaje')) return false;
    }
    
    // Filtro Prioridad
    if (filterPriority !== 'all' && msg.prioridad !== filterPriority) return false;
    
    // Filtro Fecha
    if (filterDate) {
      if (!isSameDay(new Date(msg.created_at), filterDate)) return false;
    }
    
    return true;
  });

  const clearFilters = () => {
    setFilterType("all");
    setFilterPriority("all");
    setFilterDate(undefined);
  };

  const hasActiveFilters = filterType !== 'all' || filterPriority !== 'all' || filterDate;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Centro de Mensajes</h2>
          <p className="text-muted-foreground">Bandeja de entrada y notificaciones del sistema.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setIsNewModalOpen(true)}>
            <Send className="w-4 h-4 mr-2" /> Redactar
          </Button>
        )}
      </div>

      <Tabs defaultValue="inbox" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
          <TabsTrigger value="inbox" className="flex gap-2">
            <Mail className="w-4 h-4" /> Recibidos
            {inboxMessages.some(m => !m.leido_at) && (
              <Badge variant="destructive" className="h-2 w-2 rounded-full p-0" />
            )}
          </TabsTrigger>
          {canCreate && (
            <TabsTrigger value="sent" className="flex gap-2">
              <Send className="w-4 h-4" /> Enviados
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="inbox" className="mt-4 space-y-4">
          
          {/* --- BARRA DE FILTROS --- */}
          <div className="flex flex-col sm:flex-row gap-3 p-3 bg-muted/20 rounded-lg border border-border/50 items-start sm:items-center">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mr-2">
              <Filter className="w-4 h-4" /> Filtros:
            </div>
            
            <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
              {/* Tipo */}
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[140px] h-8 text-xs bg-background">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="comunicado">Comunicados</SelectItem>
                  <SelectItem value="mensaje">Mensajes</SelectItem>
                  <SelectItem value="sistema">Notificaciones</SelectItem>
                </SelectContent>
              </Select>

              {/* Prioridad */}
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-full sm:w-[130px] h-8 text-xs bg-background">
                  <SelectValue placeholder="Prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas prioridades</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                </SelectContent>
              </Select>
            
              {/* Fecha */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full sm:w-[140px] h-8 text-xs justify-start text-left font-normal bg-background",
                      !filterDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {filterDate ? format(filterDate, "P", { locale: es }) : <span>Fecha</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterDate}
                    onSelect={setFilterDate}
                    initialFocus
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFilters}
                className="h-8 text-xs text-destructive hover:bg-destructive/10 ml-auto"
              >
                <X className="w-3 h-3 mr-1" /> Borrar
              </Button>
            )}
          </div>

          {/* --- LISTA DE MENSAJES --- */}
          {loading ? (
            <div className="text-center py-10">Cargando mensajes...</div>
          ) : filteredInbox.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-lg text-muted-foreground bg-muted/10">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No se encontraron mensajes con los filtros seleccionados.</p>
            </div>
          ) : (
            <Accordion 
              type="single" 
              collapsible 
              className="space-y-2"
              value={openedItem}
              onValueChange={handleOpenMessage}
            >
              {filteredInbox.map((msg) => (
                <AccordionItem 
                  key={msg.unique_id} 
                  value={msg.unique_id} 
                  className={`border rounded-lg px-4 transition-colors ${!msg.leido_at ? 'bg-blue-50/60 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-card'}`}
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-4 w-full text-left">
                      <div className="shrink-0">{getIcon(msg.tipo)}</div>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-sm font-medium truncate ${!msg.leido_at ? 'text-blue-900 dark:text-blue-100 font-bold' : 'text-foreground'}`}>
                            {msg.asunto}
                          </h4>
                          {msg.prioridad === 'alta' && <Badge variant="destructive" className="text-[10px] h-5">Alta</Badge>}
                          {!msg.leido_at && <Badge className="bg-blue-600 hover:bg-blue-700 text-[10px] h-5">Nuevo</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {msg.source === 'message' 
                            ? `De: ${msg.profiles?.nombre || 'Admin'} ${msg.profiles?.apellido || ''}` 
                            : 'Sistema'} 
                          {' • '} 
                          {format(new Date(msg.created_at), "dd MMM HH:mm", {locale: es})}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-4">
                    <div className="prose prose-sm max-w-none text-gray-800 dark:text-slate-200 whitespace-pre-line mb-4 pl-9">
                      {msg.cuerpo}
                    </div>
                    {/* Botones de acción */}
                    <div className="flex justify-end pl-9 gap-2">
                      {msg.requiere_confirmacion && msg.source === 'message' && (
                        msg.confirmado_at ? (
                          <div className="flex items-center text-xs text-green-700 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded border border-green-200 dark:border-green-800">
                            <CheckCheck className="w-3 h-3 mr-2" />
                            Confirmado el {format(new Date(msg.confirmado_at), "dd/MM/yyyy HH:mm")}
                          </div>
                        ) : (
                          <Button size="sm" onClick={() => handleConfirm(msg.receipt_id)}>
                            <Check className="w-4 h-4 mr-2" /> Confirmar Lectura
                          </Button>
                        )
                      )}
                      {msg.source === 'notification' && msg.tipo === 'routine_rejected' && (
                        <Button size="sm" variant="outline" asChild>
                          <a href="/tasks">
                            Ir a Mis Tareas <AlertCircle className="w-4 h-4 ml-2" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </TabsContent>

        <TabsContent value="sent" className="mt-4">
          <div className="space-y-3">
            {sentMessages.map((msg) => {
              const total = msg.message_receipts?.length || 0;
              const read = msg.message_receipts?.filter((r: any) => r.leido_at).length || 0;
              const percent = total > 0 ? Math.round((read / total) * 100) : 0;

              return (
                <Card key={msg.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3 overflow-hidden">
                        <div className="mt-1 shrink-0">{getIcon(msg.tipo)}</div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-semibold truncate">{msg.asunto}</CardTitle>
                          <CardDescription className="text-xs mt-0.5">
                            {format(new Date(msg.created_at), "PPP p", {locale: es})}
                          </CardDescription>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => viewReadDetails(msg)}>
                        <Eye className="w-4 h-4 mr-1.5" /> Estado
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3 px-4 text-sm text-muted-foreground line-clamp-2">
                    {msg.cuerpo}
                  </CardContent>
                  <CardFooter className="pt-0 pb-3 border-t bg-muted/10 px-4 py-2 mt-0 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCheck className="w-3 h-3 text-blue-500" />
                      <span>Leído: <strong>{read}/{total}</strong> ({percent}%)</span>
                    </div>
                    <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${percent}%` }} />
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
            {sentMessages.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm">No has enviado mensajes aún.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={readDetailsOpen} onOpenChange={setReadDetailsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Detalle de Destinatarios</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readReceiptsDetail.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="font-medium text-sm">{r.profiles?.nombre} {r.profiles?.apellido}</div>
                      <div className="text-xs text-muted-foreground">{r.profiles?.email}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.leido_at ? (
                        <div className="flex flex-col items-end text-green-600 dark:text-green-400 text-xs">
                          <span className="flex items-center gap-1 font-medium"><CheckCheck className="w-3 h-3"/> Visto</span>
                          <span>{format(new Date(r.leido_at), "dd/MM HH:mm")}</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-gray-400 font-normal">Pendiente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <NewMessageModal 
        open={isNewModalOpen} 
        onOpenChange={setIsNewModalOpen} 
        onSuccess={() => fetchMessages(false)} 
      />
    </div>
  );
}