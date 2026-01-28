import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertCircle, X, CheckCircle2, ShieldAlert, ShieldCheck, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";

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
  const { user, profile } = useCurrentUser();
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
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

  const isTaskPending = task?.estado === 'pendiente' || task?.estado === 'en_proceso';
  const isTaskCompleted = !isTaskPending;
  const isRejected = task?.audit_status === 'rechazado';
  const isExecutor = user?.id === task?.completado_por;
  
  const userRole = profile?.role || '';
  const canEditAsAdmin = ['director', 'lider', 'auditor'].includes(userRole);
  
  const canPerformAction = isTaskPending || (isRejected && isExecutor) || canEditAsAdmin;

  const schema: TaskField[] = useMemo(() => {
    return buildTaskSchema(routine, pdv);
  }, [routine, pdv]);

  useEffect(() => {
    if (open && task) {
      loadTaskData();
    } else {
      setFormData({ gps: null, email_send: false, email_respond: false, files: [], photos: [], inventory: [], comments: "" });
      setIsInitializing(true);
      setInitError(null);
    }
  }, [open, task?.id]);

  const loadTaskData = async () => {
    setIsInitializing(true);
    setInitError(null);
    try {
      const { data: filesData, error: filesError } = await supabase.from('evidence_files').select('*').eq('task_id', task.id);
      if (filesError) throw filesError;

      let inventoryData: any[] = [];
      if (routine?.requiere_inventario) {
        const { data: invRows, error: invError } = await supabase.from('inventory_submission_rows').select('*').eq('task_id', task.id);
        if (invError) throw invError;
        if (invRows) inventoryData = invRows;
      }

      setFormData({
        gps: task.gps_latitud ? { lat: task.gps_latitud, lng: task.gps_longitud, valid: task.gps_en_rango } : null,
        email_send: false,
        email_respond: false,
        files: filesData?.filter(f => f.tipo === 'archivo') || [],
        photos: filesData?.filter(f => f.tipo === 'foto') || [],
        inventory: inventoryData,
        comments: task.comentario || ""
      });
    } catch (error: any) {
      console.error("Error loading task data:", error);
      setInitError("No se pudieron cargar los datos de la tarea.");
    } finally {
      setIsInitializing(false);
    }
  };

  // ✅ Modificado para aceptar File[] directamente en lugar de ChangeEvent
  const handleFilesAdded = async (files: File[], type: 'foto' | 'archivo') => {
    if (!files || files.length === 0 || !task) return;
    
    setIsUploading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        // Generar nombre único pero manteniendo extensión
        const fileName = `${task.id}/${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage.from('evidence').upload(fileName, file);
        if (uploadError) throw uploadError;
        
        await supabase.from('evidence_files').insert({
          task_id: task.id,
          tipo: type,
          filename: file.name, // Nombre original o generado por la cámara
          storage_path: fileName,
          size_bytes: file.size,
          mime_type: file.type
        });
      });

      await Promise.all(uploadPromises);
      
      // Recargar lista de archivos
      const { data: newFiles } = await supabase.from('evidence_files').select('*').eq('task_id', task.id);
      
      setFormData(prev => ({ 
        ...prev, 
        files: newFiles?.filter(f => f.tipo === 'archivo') || [], 
        photos: newFiles?.filter(f => f.tipo === 'foto') || [] 
      }));
      
      toast({ title: "Carga completada", description: type === 'foto' ? "Foto guardada." : "Archivo adjuntado." });
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo subir el archivo: " + error.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteEvidence = async (id: string, path: string) => {
    if (!confirm("¿Borrar archivo?")) return;
    try {
      await supabase.storage.from('evidence').remove([path]);
      await supabase.from('evidence_files').delete().eq('id', id);
      setFormData(prev => ({ ...prev, files: prev.files.filter(f => f.id !== id), photos: prev.photos.filter(f => f.id !== id) }));
    } catch (error) { toast({ variant: "destructive", title: "Error", description: "No se pudo borrar." }); }
  };

  const handleComplete = async () => {
    // 1. Validaciones en Cliente (UX)
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
      if (error) { toast({ variant: "destructive", title: "Falta información", description: error }); return; }
    }

    setIsProcessing(true);
    try {
      // 2. Invocación Segura al Edge Function
      const { data, error } = await supabase.functions.invoke('complete-task', {
        body: {
          taskId: task.id,
          gpsData: formData.gps,
          inventory: formData.inventory,
          comments: formData.comments
        }
      });

      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      toast({ 
        title: isRejected ? "Corrección Enviada" : "Tarea Finalizada", 
        description: isRejected ? "La tarea ha sido enviada nuevamente a revisión." : "Información verificada y guardada correctamente." 
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error al guardar", description: error.message });
    } finally { 
      setIsProcessing(false); 
    }
  };

  const renderField = (field: TaskField) => {
    switch (field.type) {
      case 'location': return <LocationStep key={field.id} pdv={pdv} required={field.required} onLocationVerified={(lat, lng, valid) => setFormData(prev => ({ ...prev, gps: { lat, lng, valid } }))} />;
      case 'email_check': return <EmailStep key={field.id} requiresSend={field.id === 'email_send'} requiresRespond={field.id === 'email_respond'} sentConfirmed={formData.email_send} respondedConfirmed={formData.email_respond} onUpdate={(k, v) => setFormData(prev => ({ ...prev, [k === 'sent' ? 'email_send' : 'email_respond']: v }))} />;
      case 'file': return <EvidenceStep key={field.id} type="archivo" label={field.label} required={field.required} files={formData.files} isUploading={isUploading} onFilesAdded={(files) => handleFilesAdded(files, 'archivo')} onDelete={handleDeleteEvidence} />;
      case 'photo': return <EvidenceStep key={field.id} type="foto" label={field.label} required={field.required} minCount={field.constraints?.min} files={formData.photos} isUploading={isUploading} onFilesAdded={(files) => handleFilesAdded(files, 'foto')} onDelete={handleDeleteEvidence} />;
      case 'inventory': return <InventoryStep key={field.id} categoriesIds={field.constraints?.categories || []} savedData={formData.inventory} onChange={(data) => setFormData(prev => ({ ...prev, inventory: data }))} />;
      case 'text': return <div key={field.id} className="space-y-2"><div className="flex justify-between"><Label>{field.label}</Label>{field.required && <span className="text-xs text-destructive">*</span>}</div><Textarea placeholder="Escribe aquí..." value={formData.comments} onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))} /></div>;
      default: return null;
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full max-h-none rounded-none sm:rounded-lg sm:h-auto sm:max-h-[90vh] sm:max-w-[700px] overflow-y-auto p-0 gap-0 flex flex-col">
        
        {/* Header */}
        <DialogHeader className="p-4 sm:p-6 border-b sticky top-0 bg-background z-10 shadow-sm">
          <div className="flex justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge variant="outline" className="capitalize text-[10px]">{routine.prioridad}</Badge>
                <span className="text-xs text-muted-foreground">{task.fecha_programada}</span>
                {isTaskCompleted && <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">Completada</Badge>}
              </div>
              <DialogTitle className="text-lg leading-tight">{routine.nombre}</DialogTitle>
              <DialogDescription className="line-clamp-2 text-xs mt-1">{routine.descripcion}</DialogDescription>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={() => onOpenChange(false)}><X className="h-5 w-5" /></Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          
          {/* --- AUDIT STATUS SECTION --- */}
          {task.audit_status && task.audit_status !== 'pendiente' && (
            <div className={`mb-6 p-4 rounded-lg border ${task.audit_status === 'aprobado' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {task.audit_status === 'aprobado' ? (
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                )}
                <h4 className={`font-bold text-sm ${task.audit_status === 'aprobado' ? 'text-green-800' : 'text-red-800'}`}>
                  Auditoría: {task.audit_status === 'aprobado' ? 'Aprobada' : 'Rechazada'}
                </h4>
              </div>
              
              {task.audit_notas && (
                <div className="text-sm bg-white/50 p-3 rounded border border-black/5 mt-2">
                  <span className="font-semibold text-xs text-muted-foreground block mb-1 uppercase">Nota del Auditor:</span>
                  <p className="text-slate-800">{task.audit_notas}</p>
                </div>
              )}

              {task.audit_status === 'rechazado' && isTaskCompleted && (
                <div className="mt-3 text-xs text-red-700 font-medium">
                  * Por favor corrige la información y vuelve a guardar para enviar a revisión.
                </div>
              )}
            </div>
          )}

          {isInitializing ? (
            <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : initError ? (
            <div className="py-10 text-center text-destructive"><AlertCircle className="w-8 h-8 mx-auto mb-2"/>{initError}</div>
          ) : (
            <div className={`space-y-6 pb-4 ${!canPerformAction ? 'opacity-80 pointer-events-none' : ''}`}>
              {!canPerformAction && <div className="bg-muted p-3 rounded text-sm text-center text-muted-foreground">Solo lectura (Sin permisos de edición).</div>}
              {schema.map(field => renderField(field))}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t bg-background mt-auto sticky bottom-0 z-10 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {canPerformAction ? 'Cancelar' : 'Cerrar'}
          </Button>
          
          {canPerformAction && (
            <Button 
              onClick={handleComplete} 
              disabled={isInitializing || isProcessing || isUploading || !!initError}
              className={`w-full sm:w-auto ${isRejected ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isRejected ? 'Corregir y Reenviar' : (isTaskPending ? 'Finalizar Tarea' : 'Guardar Cambios')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}