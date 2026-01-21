import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query"; // Importar QueryClient
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bell, Check, Clock, Mail, MessageSquare, Megaphone, AlertCircle, Send, CheckCheck, Eye } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { NewMessageModal } from "./NewMessageModal";
import { useCurrentUser } from "@/hooks/use-current-user";
import { NOTIFICATIONS_QUERY_KEY } from "@/hooks/use-notifications"; // Importar key

export default function MessageList() {
  const { toast } = useToast();
  const { user, profile } = useCurrentUser();
  const queryClient = useQueryClient(); // Hook del cliente
  
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  
  // Estado para modal de detalle de lecturas (Enviados)
  const [readDetailsOpen, setReadDetailsOpen] = useState(false);
  const [selectedSentMessage, setSelectedSentMessage] = useState<any>(null);
  const [readReceiptsDetail, setReadReceiptsDetail] = useState<any[]>([]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

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
    
    const inbox = receipts?.map((r: any) => ({
      receipt_id: r.id,
      ...r.messages,
      leido_at: r.leido_at,
      confirmado_at: r.confirmado_at
    })) || [];
    
    inbox.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setInboxMessages(inbox);

    // 2. ENVIADOS
    if (['director', 'lider', 'auditor'].includes(profile?.role || '')) {
      const { data: sent, error: txError } = await supabase
        .from('messages')
        .select(`
          *,
          message_receipts (id, leido_at)
        `)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (txError) console.error("Error sent:", txError);
      setSentMessages(sent || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user, profile]);

  // Acción: Marcar como leído al abrir acordeón
  const handleOpenMessage = async (msg: any) => {
    try {
      // 1. Marcar el recibo del mensaje como leído si no lo estaba
      if (!msg.leido_at) {
        const now = new Date().toISOString();
        
        // Actualizar UI optimista
        setInboxMessages(prev => prev.map(m => 
          m.receipt_id === msg.receipt_id ? { ...m, leido_at: now } : m
        ));

        await supabase
          .from('message_receipts')
          .update({ leido_at: now })
          .eq('id', msg.receipt_id);
      }

      // 2. Actualizar la notificación en segundo plano
      const { error: notifError } = await supabase
        .from('notifications')
        .update({ leido: true })
        .eq('entity_id', msg.id)
        .eq('user_id', user.id);

      if (!notifError) {
        // Invalidar caché de notificaciones para actualizar badge inmediatamente
        queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      } else {
        console.error("Error updating notification:", notifError);
      }
    } catch (err) {
      console.error("Error handling message read:", err);
    }
  };

  // Acción: Confirmación explícita
  const handleConfirm = async (receiptId: string) => {
    const now = new Date().toISOString();
    
    setInboxMessages(prev => prev.map(m => 
      m.receipt_id === receiptId ? { ...m, confirmado_at: now, leido_at: m.leido_at || now } : m
    ));

    await supabase
      .from('message_receipts')
      .update({ confirmado_at: now, leido_at: now })
      .eq('id', receiptId);
      
    toast({ title: "Confirmado", description: "Has confirmado la recepción de este mensaje." });
  };

  // Acción: Ver detalle de lecturas (Enviados)
  const viewReadDetails = async (msg: any) => {
    setSelectedSentMessage(msg);
    setReadReceiptsDetail([]);
    setReadDetailsOpen(true);

    const { data } = await supabase
      .from('message_receipts')
      .select(`
        leido_at,
        confirmado_at,
        profiles (nombre, apellido, email)
      `)
      .eq('message_id', msg.id);
    
    if (data) setReadReceiptsDetail(data);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'tarea_flash': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'comunicado': return <Megaphone className="w-5 h-5 text-blue-500" />;
      default: return <MessageSquare className="w-5 h-5 text-gray-500" />;
    }
  };

  const canCreate = ['director', 'lider'].includes(profile?.role || '');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Centro de Mensajes</h2>
          <p className="text-muted-foreground">Comunicaciones oficiales y notificaciones.</p>
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

        <TabsContent value="inbox" className="mt-4">
          {loading ? (
            <div className="text-center py-10">Cargando...</div>
          ) : inboxMessages.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-lg text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No tienes mensajes recibidos.</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {inboxMessages.map((msg) => (
                <AccordionItem 
                  key={msg.receipt_id} 
                  value={msg.receipt_id} 
                  className={`border rounded-lg px-4 ${!msg.leido_at ? 'bg-blue-50/50 border-blue-100' : 'bg-card'}`}
                >
                  <AccordionTrigger 
                    className="hover:no-underline py-3"
                    onClick={() => handleOpenMessage(msg)}
                  >
                    <div className="flex items-center gap-4 w-full text-left">
                      <div className="shrink-0">{getIcon(msg.tipo)}</div>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-sm font-medium truncate ${!msg.leido_at ? 'text-black font-bold' : 'text-muted-foreground'}`}>
                            {msg.asunto}
                          </h4>
                          {msg.prioridad === 'alta' && <Badge variant="destructive" className="text-[10px] h-5">Alta</Badge>}
                          {!msg.leido_at && <Badge className="bg-blue-500 text-[10px] h-5">Nuevo</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          De: {msg.profiles?.nombre} {msg.profiles?.apellido} • {format(new Date(msg.created_at), "dd MMM HH:mm", {locale: es})}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-4">
                    <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line mb-4 pl-9">
                      {msg.cuerpo}
                    </div>
                    {msg.requiere_confirmacion && (
                      <div className="flex justify-end pl-9">
                        {msg.confirmado_at ? (
                          <div className="flex items-center text-xs text-green-600 font-medium bg-green-50 px-3 py-1.5 rounded border border-green-200">
                            <CheckCheck className="w-3 h-3 mr-2" />
                            Confirmado el {format(new Date(msg.confirmado_at), "dd/MM/yyyy HH:mm")}
                          </div>
                        ) : (
                          <Button size="sm" onClick={() => handleConfirm(msg.receipt_id)}>
                            <Check className="w-4 h-4 mr-2" /> Confirmar Lectura
                          </Button>
                        )}
                      </div>
                    )}
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
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex justify-between">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">{getIcon(msg.tipo)}</div>
                        <div>
                          <CardTitle className="text-base">{msg.asunto}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            Enviado el {format(new Date(msg.created_at), "PPP p", {locale: es})}
                          </CardDescription>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => viewReadDetails(msg)}>
                        <Eye className="w-4 h-4 mr-2" /> Detalles
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3 text-sm text-muted-foreground truncate">
                    {msg.cuerpo}
                  </CardContent>
                  <CardFooter className="pt-0 pb-3 border-t bg-muted/20 px-4 py-2 mt-2 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-xs">
                      <CheckCheck className="w-3 h-3 text-blue-500" />
                      <span>Leído por <strong>{read}</strong> de <strong>{total}</strong> destinatarios ({percent}%)</span>
                    </div>
                    <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
            {sentMessages.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">No has enviado mensajes aún.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={readDetailsOpen} onOpenChange={setReadDetailsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Estado de Lectura</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destinatario</TableHead>
                  <TableHead className="text-right">Leído</TableHead>
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
                        <div className="flex flex-col items-end text-green-600 text-xs">
                          <span className="flex items-center gap-1 font-medium"><CheckCheck className="w-3 h-3"/> Visto</span>
                          <span>{format(new Date(r.leido_at), "dd/MM HH:mm")}</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-gray-400">No leído</Badge>
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
        onSuccess={fetchData}
      />
    </div>
  );
}