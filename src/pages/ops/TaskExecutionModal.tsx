import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

// Sub-components
import { LocationStep } from "./components/execution/LocationStep";
import { EmailStep } from "./components/execution/EmailStep";
import { EvidenceStep } from "./components/execution/EvidenceStep";

interface TaskExecutionModalProps {
  task: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function TaskExecutionModal({ task, open, onOpenChange, onSuccess }: TaskExecutionModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Estados de ejecución
  const [gpsData, setGpsData] = useState<{lat: number, lng: number, valid: boolean} | null>(null);
  const [comentario, setComentario] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  
  // Estados para nuevos requisitos
  const [emailSent, setEmailSent] = useState(false);
  const [emailResponded, setEmailResponded] = useState(false);
  
  const rutina = task?.routine_templates;
  const pdv = task?.pdv;

  useEffect(() => {
    if (open && task) {
      setGpsData(rutina?.gps_obligatorio ? null : { lat: 0, lng: 0, valid: true });
      setComentario("");
      setUploadedFiles([]);
      setEmailSent(false);
      setEmailResponded(false);
      fetchEvidence();
    }
  }, [open, task]);

  const fetchEvidence = async () => {
    if (!task) return;
    const { data } = await supabase.from('evidence_files').select('*').eq('task_id', task.id);
    setUploadedFiles(data || []);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'foto' | 'archivo') => {
    const file = event.target.files?.[0];
    if (!file || !task) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${task.id}/${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('evidence').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from('evidence_files').insert({
        task_id: task.id,
        tipo: type,
        filename: file.name,
        storage_path: fileName,
        size_bytes: file.size,
        mime_type: file.type
      });
      if (dbError) throw dbError;

      toast({ title: "Subido", description: "Archivo guardado." });
      fetchEvidence();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleDeleteEvidence = async (id: string, path: string) => {
    if (!confirm("¿Borrar?")) return;
    await supabase.storage.from('evidence').remove([path]);
    await supabase.from('evidence_files').delete().eq('id', id);
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleComplete = async () => {
    // 1. Validar GPS
    if (rutina?.gps_obligatorio && !gpsData?.valid) {
      toast({ variant: "destructive", title: "Bloqueo GPS", description: "Debes validar tu ubicación." });
      return;
    }

    // 2. Validar Fotos
    if (rutina?.fotos_obligatorias) {
      const count = uploadedFiles.filter(f => f.tipo === 'foto').length;
      if (count < (rutina.min_fotos || 1)) {
        toast({ variant: "destructive", title: "Fotos insuficientes", description: `Mínimo ${rutina.min_fotos || 1} fotos.` });
        return;
      }
    }

    // 3. Validar Archivos
    if (rutina?.archivo_obligatorio) {
      if (uploadedFiles.filter(f => f.tipo === 'archivo').length === 0) {
        toast({ variant: "destructive", title: "Archivo requerido", description: "Adjunta el documento." });
        return;
      }
    }

    // 4. Validar Emails
    if (rutina?.enviar_email && !emailSent) {
      toast({ variant: "destructive", description: "Confirma el envío del correo." });
      return;
    }
    if (rutina?.responder_email && !emailResponded) {
      toast({ variant: "destructive", description: "Confirma la respuesta del correo." });
      return;
    }

    // 5. Comentario
    if (rutina?.comentario_obligatorio && !comentario.trim()) {
      toast({ variant: "destructive", description: "Comentario obligatorio." });
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No auth");

      const { error } = await supabase
        .from('task_instances')
        .update({
          estado: 'completada', 
          completado_at: new Date().toISOString(),
          completado_por: user.id,
          gps_latitud: gpsData?.lat,
          gps_longitud: gpsData?.lng,
          gps_en_rango: gpsData?.valid,
          comentario: comentario
        })
        .eq('id', task.id);

      if (error) throw error;

      toast({ title: "¡Tarea Completada!", description: "Registrada exitosamente." });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="capitalize">{rutina.prioridad}</Badge>
            <span className="text-xs text-muted-foreground">{task.fecha_programada}</span>
          </div>
          <DialogTitle>{rutina.nombre}</DialogTitle>
          <DialogDescription>{rutina.descripcion}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          
          <LocationStep 
            pdv={pdv} 
            required={rutina.gps_obligatorio} 
            onLocationVerified={(lat, lng, valid) => setGpsData({ lat, lng, valid })} 
          />

          <EmailStep 
            requiresSend={rutina.enviar_email}
            requiresRespond={rutina.responder_email}
            sentConfirmed={emailSent}
            respondedConfirmed={emailResponded}
            onUpdate={(field, val) => field === 'sent' ? setEmailSent(val) : setEmailResponded(val)}
          />

          <EvidenceStep 
            type="archivo"
            title="Documentos Adjuntos"
            required={rutina.archivo_obligatorio}
            files={uploadedFiles.filter(f => f.tipo === 'archivo')}
            isUploading={isUploading}
            onUpload={handleFileUpload}
            onDelete={handleDeleteEvidence}
          />

          <EvidenceStep 
            type="foto"
            title="Evidencia Fotográfica"
            required={rutina.fotos_obligatorias}
            minCount={rutina.min_fotos}
            files={uploadedFiles.filter(f => f.tipo === 'foto')}
            isUploading={isUploading}
            onUpload={handleFileUpload}
            onDelete={handleDeleteEvidence}
          />

          {rutina.requiere_inventario && (
            <div className="p-4 rounded-lg border bg-orange-50/50 border-orange-100">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2 text-sm text-orange-800">
                  <CheckSquare className="w-4 h-4" /> Toma de Inventario
                </h4>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled>Iniciar</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Notas de ejecución</Label>
              {rutina.comentario_obligatorio && <span className="text-xs text-destructive font-medium">* Requerido</span>}
            </div>
            <Textarea 
              placeholder="Observaciones..." 
              value={comentario} 
              onChange={(e) => setComentario(e.target.value)} 
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={handleComplete} 
            disabled={isLoading || isUploading || (rutina.gps_obligatorio && !gpsData?.valid)}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Finalizar Tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}