import { useState, useEffect, useMemo } from "react";
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

// Logic
import { buildTaskSchema, TaskField } from "./logic/task-schema";

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
  
  // --- STATE (Datos del Formulario) ---
  const [formData, setFormData] = useState<{
    gps: { lat: number, lng: number, valid: boolean } | null;
    email_send: boolean;
    email_respond: boolean;
    files: any[];
    photos: any[];
    inventory: any;
    comments: string;
  }>({
    gps: null,
    email_send: false,
    email_respond: false,
    files: [],
    photos: [],
    inventory: null,
    comments: ""
  });

  const routine = task?.routine_templates;
  const pdv = task?.pdv;

  // 1. Construir Schema Dinámico
  const schema: TaskField[] = useMemo(() => {
    return buildTaskSchema(routine, pdv);
  }, [routine, pdv]);

  // Reset y Carga inicial
  useEffect(() => {
    if (open && task) {
      setFormData({
        gps: null,
        email_send: false,
        email_respond: false,
        files: [],
        photos: [],
        inventory: null,
        comments: ""
      });
      fetchEvidence();
    }
  }, [open, task]);

  const fetchEvidence = async () => {
    if (!task) return;
    const { data } = await supabase.from('evidence_files').select('*').eq('task_id', task.id);
    if (data) {
      setFormData(prev => ({
        ...prev,
        files: data.filter(f => f.tipo === 'archivo'),
        photos: data.filter(f => f.tipo === 'foto')
      }));
    }
  };

  // --- HANDLERS GENÉRICOS ---

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
    
    // Actualizar estado local
    setFormData(prev => ({
      ...prev,
      files: prev.files.filter(f => f.id !== id),
      photos: prev.photos.filter(f => f.id !== id)
    }));
  };

  const handleComplete = async () => {
    // 2. Validación Dinámica (Loop sobre el schema)
    for (const field of schema) {
      let valueToValidate;
      
      switch (field.id) {
        case 'gps': valueToValidate = formData.gps; break;
        case 'email_send': valueToValidate = formData.email_send; break;
        case 'email_respond': valueToValidate = formData.email_respond; break;
        case 'files': valueToValidate = formData.files; break;
        case 'photos': valueToValidate = formData.photos; break;
        case 'comments': valueToValidate = formData.comments; break;
        default: valueToValidate = null;
      }

      const error = field.validate(valueToValidate);
      if (error) {
        toast({ variant: "destructive", title: "Falta información", description: error });
        return; // Detener flujo
      }
    }

    // 3. Persistencia
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
          gps_latitud: formData.gps?.lat,
          gps_longitud: formData.gps?.lng,
          gps_en_rango: formData.gps?.valid,
          comentario: formData.comments
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

  // --- RENDERER (Renderiza componente según tipo) ---
  const renderField = (field: TaskField) => {
    switch (field.type) {
      case 'location':
        return (
          <LocationStep 
            key={field.id}
            pdv={pdv} 
            required={field.required} 
            onLocationVerified={(lat, lng, valid) => setFormData(prev => ({ ...prev, gps: { lat, lng, valid } }))} 
          />
        );
      
      case 'email_check':
        return (
          <EmailStep 
            key={field.id}
            requiresSend={field.id === 'email_send'}
            requiresRespond={field.id === 'email_respond'}
            sentConfirmed={formData.email_send}
            respondedConfirmed={formData.email_respond}
            onUpdate={(k, v) => setFormData(prev => ({ 
              ...prev, 
              [k === 'sent' ? 'email_send' : 'email_respond']: v 
            }))}
          />
        );

      case 'file':
        return (
          <EvidenceStep 
            key={field.id}
            type="archivo"
            label={field.label}
            required={field.required}
            files={formData.files}
            isUploading={isUploading}
            onUpload={handleFileUpload}
            onDelete={handleDeleteEvidence}
          />
        );

      case 'photo':
        return (
          <EvidenceStep 
            key={field.id}
            type="foto"
            label={field.label}
            required={field.required}
            minCount={field.constraints?.min}
            files={formData.photos}
            isUploading={isUploading}
            onUpload={handleFileUpload}
            onDelete={handleDeleteEvidence}
          />
        );

      case 'inventory':
        return (
          <div key={field.id} className="p-4 rounded-lg border bg-orange-50/50 border-orange-100">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold flex items-center gap-2 text-sm text-orange-800">
                <CheckSquare className="w-4 h-4" /> {field.label}
              </h4>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled>
                Iniciar ({field.constraints?.categories?.length || 0} Cats)
              </Button>
            </div>
          </div>
        );

      case 'text':
        return (
          <div key={field.id} className="space-y-2">
            <div className="flex justify-between">
              <Label>{field.label}</Label>
              {field.required && <span className="text-xs text-destructive font-medium">* Requerido</span>}
            </div>
            <Textarea 
              placeholder="Escribe aquí..." 
              value={formData.comments} 
              onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))} 
            />
          </div>
        );

      default:
        return null;
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="capitalize">{routine.prioridad}</Badge>
            <span className="text-xs text-muted-foreground">{task.fecha_programada}</span>
          </div>
          <DialogTitle>{routine.nombre}</DialogTitle>
          <DialogDescription>{routine.descripcion}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {schema.map(field => renderField(field))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={handleComplete} 
            disabled={isLoading || isUploading}
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