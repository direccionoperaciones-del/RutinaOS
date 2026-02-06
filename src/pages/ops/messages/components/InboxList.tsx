import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCheck, AlertCircle, Megaphone, ShieldAlert, ShieldCheck, MessageSquare, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface InboxListProps {
  messages: any[];
  loading: boolean;
  onOpenMessage: (val: string) => void;
  onConfirm: (id: string) => void;
}

export function InboxList({ messages, loading, onOpenMessage, onConfirm }: InboxListProps) {
  
  const getIcon = (type: string) => {
    switch (type) {
      case 'tarea_flash': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'comunicado': return <Megaphone className="w-5 h-5 text-blue-500" />;
      case 'routine_rejected': return <ShieldAlert className="w-5 h-5 text-red-600" />;
      case 'routine_approved': return <ShieldCheck className="w-5 h-5 text-green-600" />;
      default: return <MessageSquare className="w-5 h-5 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-10 flex flex-col items-center gap-2 text-muted-foreground">
        <RefreshCw className="w-6 h-6 animate-spin" />
        Cargando mensajes...
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed rounded-lg text-muted-foreground bg-muted/10">
        <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>No se encontraron mensajes.</p>
      </div>
    );
  }

  return (
    <Accordion type="single" collapsible className="space-y-2" onValueChange={onOpenMessage}>
      {messages.map((msg) => (
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
            
            <div className="flex justify-end pl-9 gap-2">
              {msg.requiere_confirmacion && msg.source === 'message' && (
                msg.confirmado_at ? (
                  <div className="flex items-center text-xs text-green-700 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded border border-green-200 dark:border-green-800">
                    <CheckCheck className="w-3 h-3 mr-2" />
                    Confirmado el {format(new Date(msg.confirmado_at), "dd/MM/yyyy HH:mm")}
                  </div>
                ) : (
                  <Button size="sm" onClick={() => onConfirm(msg.receipt_id)}>
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
  );
}