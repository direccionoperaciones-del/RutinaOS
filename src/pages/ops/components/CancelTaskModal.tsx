import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CancelTaskModalProps {
  task: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CancelTaskModal({ task, open, onOpenChange, onSuccess }: CancelTaskModalProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState("today");
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    if (!reason.trim()) {
      toast({ variant: "destructive", title: "Motivo requerido", description: "Debes explicar por qué se cancela la tarea." });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-task', {
        body: {
          taskId: task.id,
          reason: reason,
          scope: scope
        }
      });

      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      toast({ title: "Tarea Cancelada", description: data.message });
      onSuccess();
      onOpenChange(false);
      setReason(""); // Reset
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> Cancelar Tarea
          </DialogTitle>
          <DialogDescription>
            Estás a punto de cancelar <strong>{task?.routine_templates?.nombre}</strong>.
            Esta acción retirará la tarea de la lista operativa del día.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Motivo de cancelación <span className="text-destructive">*</span></Label>
            <Textarea 
              placeholder="Ej: PDV cerrado por mantenimiento, falta de insumos..." 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none h-24"
            />
          </div>

          <div className="space-y-2">
            <Label>Alcance</Label>
            <RadioGroup value={scope} onValueChange={setScope} className="flex flex-col space-y-2 bg-muted/30 p-3 rounded-md border">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="today" id="r1" />
                <Label htmlFor="r1" className="font-normal cursor-pointer">Solo esta tarea (Instancia de hoy)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="future" id="r2" />
                <Label htmlFor="r2" className="font-normal cursor-pointer">Esta y futuras (Desactivar asignación)</Label>
              </div>
            </RadioGroup>
          </div>
          
          <div className="text-xs text-muted-foreground bg-yellow-50 p-2 rounded border border-yellow-100">
            <strong>Nota:</strong> Las tareas canceladas no afectarán negativamente las métricas de cumplimiento del administrador.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Volver
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Cancelación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}