import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, CheckCheck, Megaphone, MessageSquare, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface SentListProps {
  messages: any[];
  onViewDetails: (msg: any) => void;
}

export function SentList({ messages, onViewDetails }: SentListProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'tarea_flash': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'comunicado': return <Megaphone className="w-5 h-5 text-blue-500" />;
      default: return <MessageSquare className="w-5 h-5 text-gray-500" />;
    }
  };

  if (messages.length === 0) {
    return <div className="text-center py-10 text-muted-foreground text-sm">No has enviado mensajes aún.</div>;
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
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
                <Button variant="ghost" size="sm" className="h-8" onClick={() => onViewDetails(msg)}>
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
    </div>
  );
}