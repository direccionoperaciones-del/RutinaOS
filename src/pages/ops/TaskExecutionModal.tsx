import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

// Sub-components
import { LocationStep } from "./components/execution/LocationStep";
import { EmailStep } from "./components/execution/EmailStep";
import { EvidenceStep } from "./components/execution/EvidenceStep";
import { InventoryStep } from "./components/execution/InventoryStep";

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
  
  // Estado de carga inicial (hidratación de datos)
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  
  // Estado de procesos (subida/guardado)
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const [formData, setFormData] = useState<{
    gps: { lat: number, lng: number, valid: boolean } | null;
    email_send: boolean;
    email_respond: boolean;
    files: any[];
    photos: any[];
    inventory: any[]; 
    comments: string;
  }>({
    gps: null,
    email_send: false,
    email_respond: false,
    files: [],
    photos: [],
    inventory: [],
    comments: ""
  });

  const routine = task?.routine_templates;
  const pdv = task?.pdv;

  const schema: TaskField[] = useMemo(() => {
    return buildTaskSchema(routine, pdv);
  }, [routine, pdv]);

  // Efecto ÚNICO de carga al abrir
  useEffect(() => {
    if (open && task) {
      loadTaskData();
    } else {
      // Reset al cerrar
      setFormData({
        gps: null,
        email_send: false,
        email_respond: false,
        files: [],
        photos: [],
        inventory: [],
        comments: ""
      });
      setIsInitializing(true);
      setInitError(null);
    }
  }, [open, task?.id]); // Dependencia clave: task.id (si cambia la tarea, recarga)

  const loadTaskData = async () => {
    setIsInitializing(true);
    setInitError(null);
    
    try {
      // 1. Cargar Evidencias
      const { data: filesData, error: filesError } = await supabase
        .from('evidence_files')
        .select('*')
        .eq('task_id', task.id);
      
      if (filesError) throw filesError;

      // 2. Cargar Inventario
      let inventoryData: any[] = [];
      if (routine?.requiere_inventario) {
        const { data: invRows, error: invError } = await supabase
          .from('inventory_submission_rows')
          .select('*')
          .eq('task_id', task.id);
        
        if (invError) throw invError;
        if (invRows) inventoryData = invRows;
      }

      // 3. Hidratar Estado
      setFormData({
        gps: task.gps_latitud ? { lat: task.gps_latitud, lng: task.gps_longitud, valid: task.gps_en_rango } : null,
        email_send: false, // Estos flags no se guardaban en la BD en versiones anteriores, asumimos false
        email_respond: false,
        files: filesData?.filter(f => f.tipo === 'archivo') || [],
        photos: filesData?.filter(f => f.tipo === 'foto') || [],
        inventory: inventoryData,
        comments: task.comentario || ""
      });

    } catch (error: any) {
      console.error("Error loading task data:", error);
      setInitError("No se pudieron cargar los datos de la tarea. Por favor, intenta de nuevo.");
    } finally {
      setIsInitializing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'foto' | 'archivo') => {
    const files = event.target.files; 
    if (!files || files.length === 0 || !task) return;

    setIsUploading(true);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
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
      });

      await Promise.all(uploadPromises);
      
      // Recargar SOLO las evidencias para no resetear inputs de usuario
      const { data: newFiles } = await supabase.from('evidence_files').select('*').eq('task_id', task.id);
      
      setFormData(prev => ({
        ...prev,
        files: newFiles?.filter(f => f.tipo === 'archivo') || [],
        photos: newFiles?.filter(f => f.tipo === 'foto') || []
      }));

      toast({ title: "Subida completada", description: `Se han guardado ${files.length} archivo(s).` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsUploading(false);
      event.target.value = ""; 
    }
  };

  const handleDeleteEvidence = async (id: string, path: string) => {
    if (!confirm("¿Borrar archivo?")) return;
    try {
      await supabase.storage.from('evidence').remove([path]);
      await supabase.from('evidence_files').delete().eq('id', id);
      
      setFormData(prev => ({
        ...prev,
        files: prev.files.filter(f => f.id !== id),
        photos: prev.photos.filter(f => f.id !== id)
      }));
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo borrar el archivo." });
    }
  };

  const handleComplete = async () => {
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
        return; 
      }
    }

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Guardar Inventario
      if (formData.inventory.length > 0) {
        await supabase.from('inventory_submission_rows').delete().eq('task_id', task.id);
        const inventoryRows = formData.inventory.map(row => ({
          task_id: task.id,
          producto_id: row.producto_id,
          esperado: row.esperado,
          fisico: row.fisico,
        }));
        const { error: invError } = await supabase.from('inventory_submission_rows').insert(inventoryRows);
        if (invError) throw invError;
      }

      // Actualizar Tarea
      const now = new Date();
      const limitDate = new Date(`${task.fecha_programada}T${task.hora_limite_snapshot}`);
      const finalStatus = now > limitDate ? 'completada_vencida' : 'completada_a_tiempo';

      const { error } = await supabase
        .from('task_instances')
        .update({
          estado: finalStatus, 
          completado_at: now.toISOString(),
          completado_por: user.id,
          gps_latitud: formData.gps?.lat,
          gps_longitud: formData.gps?.lng,
          gps_en_rango: formData.gps?.valid,
          comentario: formData.comments
        })
        .eq('id', task.id);

      if (error) throw error;

      toast({ 
        title: finalStatus === 'completada_a_tiempo' ? "¡Tarea Completada!" : "Tarea Completada (Vencida)", 
        description: "Información guardada correctamente." 
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsProcessing(false);
    }
  };

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
          <InventoryStep 
            key={field.id}
            categoriesIds={field.constraints?.categories || []}
            savedData={formData.inventory} 
            onChange={(data) => setFormData(prev => ({ ...prev, inventory: data }))}
          />
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

      default: return null;
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="capitalize">{routine.prioridad}</Badge>
            <span className="text-xs text-muted-foreground">{task.fecha_programada}</span>
          </div>
          <DialogTitle>{routine.nombre}</DialogTitle>
          <DialogDescription>{routine.descripcion}</DialogDescription>
        </DialogHeader>

        {isInitializing ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            <p>Cargando datos de la tarea...</p>
          </div>
        ) : initError ? (
          <div className="py-10 flex flex-col items-center justify-center text-destructive">
            <AlertCircle className="w-10 h-10 mb-4" />
            <p className="mb-4">{initError}</p>
            <Button variant="outline" onClick={loadTaskData}>Reintentar</Button>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {schema.map(field => renderField(field))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={handleComplete} 
            disabled={isInitializing || isProcessing || isUploading || !!initError}
            className="bg-green-600 hover:bg-green-700"
          >
            {isProcessing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {task.estado === 'pendiente' ? 'Finalizar Tarea' : 'Actualizar Tarea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}