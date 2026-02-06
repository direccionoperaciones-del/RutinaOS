import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCheck } from "lucide-react";
import { format } from "date-fns";

interface ReadDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string | null;
}

export function ReadDetailsDialog({ open, onOpenChange, messageId }: ReadDetailsDialogProps) {
  const [details, setDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && messageId) {
      const fetchDetails = async () => {
        setLoading(true);
        const { data } = await supabase
          .from('message_receipts')
          .select(`leido_at, confirmado_at, profiles (nombre, apellido, email)`)
          .eq('message_id', messageId);
        
        if (data) setDetails(data);
        setLoading(false);
      };
      fetchDetails();
    } else {
      setDetails([]);
    }
  }, [open, messageId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              {loading ? (
                <TableRow><TableCell colSpan={2} className="text-center">Cargando...</TableCell></TableRow>
              ) : details.map((r, idx) => (
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
  );
}