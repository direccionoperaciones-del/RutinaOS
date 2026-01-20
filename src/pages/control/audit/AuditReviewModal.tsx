import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, User, Calendar, CheckCircle2, XCircle, AlertTriangle, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface AuditReviewModalProps {
  task: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AuditReviewModal({ task, open, onOpenChange, onSuccess }: AuditReviewModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  if (!task) return null;

  const handleAudit = async () => {
    if (action === 'reject' && !notes.trim()) {
      toast({ 
        variant: "destructive", 
        title: "Requerido", 
        description: "Debes escribir una nota explicando el motivo del rechazo." 
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const updateData = {
        audit_status: action === 'approve' ? 'aprobado' : 'rechazado',
        audit_at: new Date().toISOString(),
        audit_by: user.id,
        audit_notas: notes
      };

      const { error } = await supabase
        .from('task_instances')
        .update(updateData)
        .eq('id', task.id);

      if (error) throw error;

      toast({ 
        title: action === 'approve' ? "Tarea Aprobada" : "Tarea Rechazada", 
        description: "La auditoría se ha registrado correctamente." 
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'aprobado': return 'bg-green-100 text-green-800 border-green-200';
      case 'rechazado': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="capitalize">
              {task.routine_templates?.prioridad}
            </Badge>
            {task.audit_status && (
              <Badge className={getStatusColor(task.audit_status)}>
                {task.audit_status.toUpperCase()}
              </Badge>
            )}
          </div>
          <DialogTitle>{task.routine_templates?.nombre}</DialogTitle>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <User className="w-3 h-3" /> 
            Ejecutado por: {task.profiles?.nombre} {task.profiles?.apellido}
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Detalles de Ejecución</TabsTrigger>
            <TabsTrigger value="evidence">Evidencia</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 py-4">
            {/* Info Básica */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <Label className="text-muted-foreground">PDV</Label>
                <p className="font-medium">{task.pdv?.nombre}</p>
                <p className="text-xs text-muted-foreground">{task.pdv?.ciudad}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Fecha Completado</Label>
                <p className="font-medium">
                  {task.completado_at 
                    ? format(new Date(task.completado_at), "PPP p", { locale: es }) 
                    : "N/A"}
                </p>
              </div>
            </div>

            {/* Validación GPS */}
            <div className={`p-4 rounded-lg border flex items-start gap-3 ${task.gps_en_rango ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              {task.gps_en_rango ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div>
                <h4 className={`font-semibold text-sm ${task.gps_en_rango ? 'text-green-800' : 'text-red-800'}`}>
                  {task.gps_en_rango ? "GPS Válido (En rango)" : "Alerta de GPS (Fuera de rango)"}
                </h4>
                <div className="text-xs mt-1 opacity-90">
                  <p>Coordenadas registro: {task.gps_latitud?.toFixed(5)}, {task.gps_longitud?.toFixed(5)}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="evidence" className="py-4">
             <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg bg-muted/30">
                <FileText className="w-10 h-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No hay archivos adjuntos</p>
             </div>
             {/* Aquí iría la galería de fotos en el futuro */}
          </TabsContent>
        </Tabs>

        {/* Sección de Auditoría */}
        <div className="border-t pt-4 space-y-4">
          <Label>Notas de Auditoría</Label>
          <Textarea 
            placeholder="Escribe tus observaciones aquí (requerido para rechazar)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!!task.audit_status && task.audit_status !== 'pendiente'}
          />

          {!task.audit_status || task.audit_status === 'pendiente' ? (
            <div className="flex gap-3 pt-2">
              <Button 
                className="flex-1 bg-green-600 hover:bg-green-700" 
                onClick={() => { setAction('approve'); handleAudit(); }}
                disabled={isLoading}
              >
                {isLoading && action === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Aprobar
              </Button>
              <Button 
                className="flex-1" 
                variant="destructive"
                onClick={() => { setAction('reject'); handleAudit(); }}
                disabled={isLoading}
              >
                {isLoading && action === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                Rechazar
              </Button>
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-2 bg-muted rounded">
              Esta tarea ya fue auditada por el usuario.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}