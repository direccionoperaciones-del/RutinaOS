import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Check, Clock, Mail, MessageSquare, Megaphone, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { NewMessageModal } from "./NewMessageModal";

export default function MessageList() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  
  // Estado para lecturas (caché local rápido)
  const [readReceipts, setReadReceipts] = useState<Set<string>>(new Set());

  const fetchProfileAndMessages = async () => {
    setLoading(true);
    
    // 1. Obtener perfil completo con asignación de PDV vigente
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select(`
        *,
        pdv_assignments!inner(pdv_id)
      `)
      .eq('id', user.id)
      .eq('pdv_assignments.vigente', true)
      .maybeSingle(); // Puede ser null si no tiene PDV

    // Si no tiene asignación por join, obtener perfil base
    let finalProfile = profile;
    if (!finalProfile) {
       const { data: baseProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
       finalProfile = { ...baseProfile, pdv_assignments: [] };
    }
    
    setUserProfile(finalProfile);

    // 2. Obtener todos los mensajes del tenant
    // (Optimizacion: En producción real esto debería ser una RPC o View para filtrar en backend)
    const { data: allMessages, error } = await supabase
      .from('messages')
      .select(`
        *,
        message_recipients(recipient_type, recipient_id),
        created_by_profile:created_by(nombre, apellido)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los mensajes" });
      setLoading(false);
      return;
    }

    // 3. Filtrar en memoria los que me corresponden
    const myMessages = allMessages.filter(msg => {
      // Verificar cada destinatario del mensaje
      return msg.message_recipients.some((r: any) => {
        if (r.recipient_type === 'all') return true;
        if (r.recipient_type === 'user' && r.recipient_id === user.id) return true;
        if (r.recipient_type === 'role' && r.recipient_id === finalProfile.role) return true;
        // Check PDV assignment
        if (r.recipient_type === 'pdv' && finalProfile.pdv_assignments?.some((a: any) => a.pdv_id === r.recipient_id)) return true;
        
        return false;
      });
    });

    setMessages(myMessages);

    // 4. Obtener mis recibos de lectura/confirmación
    const { data: receipts } = await supabase
      .from('message_receipts')
      .select('message_id, leido_at, confirmado_at')
      .eq('user_id', user.id);
    
    const readSet = new Set<string>();
    receipts?.forEach(r => {
      if (r.leido_at || r.confirmado_at) readSet.add(r.message_id);
    });
    setReadReceipts(readSet);

    setLoading(false);
  };

  useEffect(() => {
    fetchProfileAndMessages();
  }, []);

  const markAsRead = async (msgId: string, confirm: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload: any = {
      message_id: msgId,
      user_id: user.id,
      leido_at: new Date().toISOString()
    };
    if (confirm) {
      payload.confirmado_at = new Date().toISOString();
    }

    // Upsert para manejar si ya existe o no
    const { error } = await supabase
      .from('message_receipts')
      .upsert(payload, { onConflict: 'message_id,user_id' });

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo confirmar lectura" });
    } else {
      setReadReceipts(prev => new Set(prev).add(msgId));
      if (confirm) {
        toast({ title: "Confirmado", description: "Has confirmado la lectura del mensaje." });
      }
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'tarea_flash': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'comunicado': return <Megaphone className="w-5 h-5 text-blue-500" />;
      default: return <MessageSquare className="w-5 h-5 text-gray-500" />;
    }
  };

  const canCreate = userProfile?.role === 'director' || userProfile?.role === 'lider';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Centro de Mensajes</h2>
          <p className="text-muted-foreground">Comunicados oficiales y alertas operativas.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setIsNewModalOpen(true)}>
            <Mail className="w-4 h-4 mr-2" /> Nuevo Mensaje
          </Button>
        )}
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="text-center py-10">Cargando mensajes...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/20">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
            <h3 className="text-lg font-medium">Bandeja vacía</h3>
            <p className="text-muted-foreground">No tienes mensajes nuevos.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isRead = readReceipts.has(msg.id);
            const isHighPriority = msg.prioridad === 'alta';

            return (
              <Card 
                key={msg.id} 
                className={`transition-all ${!isRead ? 'border-l-4 border-l-primary bg-primary/5' : 'opacity-80'}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">{getIcon(msg.tipo)}</div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {isHighPriority && <Badge variant="destructive">Prioridad Alta</Badge>}
                          {!isRead && <Badge className="bg-primary">Nuevo</Badge>}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(msg.created_at), "PPP p", { locale: es })}
                          </span>
                        </div>
                        <CardTitle className="text-lg leading-tight">{msg.asunto}</CardTitle>
                        <CardDescription>
                          De: {msg.created_by_profile?.nombre} {msg.created_by_profile?.apellido}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {msg.cuerpo}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end pt-2 border-t mt-2 bg-muted/20">
                  {msg.requiere_confirmacion ? (
                    <Button 
                      size="sm" 
                      onClick={() => markAsRead(msg.id, true)} 
                      disabled={isRead}
                      variant={isRead ? "outline" : "default"}
                    >
                      {isRead ? (
                        <>
                          <Check className="w-4 h-4 mr-2" /> Leído y Confirmado
                        </>
                      ) : (
                        "Confirmar Lectura"
                      )}
                    </Button>
                  ) : (
                    !isRead && (
                      <Button size="sm" variant="ghost" onClick={() => markAsRead(msg.id, false)}>
                        Marcar como leído
                      </Button>
                    )
                  )}
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>

      <NewMessageModal 
        open={isNewModalOpen} 
        onOpenChange={setIsNewModalOpen} 
        onSuccess={fetchProfileAndMessages}
      />
    </div>
  );
}