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
import { calculateTaskDeadline } from "./logic/task-deadline";

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

  // --- LÓGICA DE ESTADO Y PERMISOS CORREGIDA ---
  
  // 1. Estado original de la tarea
  const isTaskPending = task?.estado === 'pendiente' || task?.estado === 'en_proceso';
  
  // 2. Verificar si fue rechazada y necesita corrección
  const isRejected = task?.audit_status === 'rechazado';
  
  // 3. Verificar si soy el ejecutor (Owner)
  const isExecutor = user?.id === task?.completado_por || user?.id === task?.responsable_id;
  
  // 4. Determinar si puedo editar:
  //    a) Está pendiente/en proceso
  //    b) O está rechazada Y soy el ejecutor (para corregir)
  //    c) O tengo rol alto (director/lider) para editar admin
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
        await supabase.from('evidence_files').insert({
          task_id: task.id,
          tipo: type,
          filename: file.name,
          storage_path: fileName,
          size_bytes: file.size,
          mime_type: file.type
        });
      });
      await Promise.all(uploadPromises);
      const { data: newFiles } = await supabase.from('evidence_files').select('*').eq('task_id', task.id);
      setFormData(prev => ({ ...prev, files: newFiles?.filter(f => f.tipo === 'archivo') || [], photos: newFiles?.filter(f => f.tipo === 'foto') || [] }));
      toast({ title: "Subida completada", description: "Archivos guardados." });
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
      setFormData(prev => ({ ...prev, files: prev.files.filter(f => f.id !== id), photos: prev.photos.filter(f => f.id !== id) }));
    } catch (error) { toast({ variant: "destructive", title: "Error", description: "No se pudo borrar." }); }
  };

  const handleComplete = async () => {
    // 1. Validaciones
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      
      // 2. Guardar Inventario
      if (formData.inventory.length > 0) {
        await supabase.from('inventory_submission_rows').delete().eq('task_id', task.id);
        const rows = formData.inventory.map(r => ({ task_id: task.id, producto_id: r.producto_id, esperado: r.esperado, fisico: r.fisico }));
        await supabase.from('inventory_submission_rows').insert(rows);
      }

      // 3. Calcular Estado
      const now = new Date();
      let newStatus = task.estado;
      
      // Si estaba pendiente, calculamos si venció
      if (isTaskPending) {
         try { const limit = calculateTaskDeadline(task); newStatus = now > limit ? 'completada_vencida' : 'completada_a_tiempo'; } 
         catch (e) { newStatus = 'completada_a_tiempo'; }
      }

      // 4. Determinar Audit Status (Lógica de Reenvío)
      // Si estaba rechazada, al guardar pasa a 'pendiente' (se reenvía a la cola del auditor)
      const nextAuditStatus = task.audit_status === 'rechazado' ? 'pendiente' : task.audit_status;

      // 5. Update Principal
      const { error } = await supabase.from('task_instances').update({
          estado: newStatus, 
          completado_at: isTaskPending ? now.toISOString() : task.completado_at,
          completado_por: task.completado_por || user.id, // Si ya tenía ejecutor, mantenerlo, sino yo
          gps_latitud: formData.gps?.lat, 
          gps_longitud: formData.gps?.lng, 
          gps_en_rango: formData.gps?.valid,
          comentario: formData.comments,
          
          // Reenvío a auditoría
          audit_status: nextAuditStatus,
          // Opcional: Podríamos limpiar audit_notas para "limpiar" el rechazo visualmente, 
          // pero mejor dejarlo hasta que el auditor lo apruebe de nuevo.
        }).eq('id', task.id);

      if (error) throw error;

      toast({ 
        title: isRejected ? "Corrección Enviada" : "Tarea Finalizada", 
        description: isRejected ? "La tarea ha sido enviada nuevamente a revisión." : "Información guardada correctamente." 
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally { setIsProcessing(false); }
  };

  const renderField = (field: TaskField) => {
    switch (field.type) {
      case 'location': return <LocationStep key={field.id} pdv={pdv} required={field.required} onLocationVerified={(lat, lng, valid) => setFormData(prev => ({ ...prev, gps: { lat, lng, valid } }))} />;
      case 'email_check': return <EmailStep key={field.id} requiresSend={field.id === 'email_send'} requiresRespond={field.id === 'email_respond'} sentConfirmed={formData.email_send} respondedConfirmed={formData.email_respond} onUpdate={(k, v) => setFormData(prev => ({ ...prev, [k === 'sent' ? 'email_send' : 'email_respond']: v }))} />;
      case 'file': return <EvidenceStep key={field.id} type="archivo" label={field.label} required={field.required} files={formData.files} isUploading={isUploading} onUpload={handleFileUpload} onDelete={handleDeleteEvidence} />;
      case 'photo': return <EvidenceStep key={field.id} type="foto" label={field.label} required={field.required} minCount={field.constraints?.min} files={formData.photos} isUploading={isUploading} onUpload={handleFileUpload} onDelete={handleDeleteEvidence} />;
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

              {task.audit_status === 'rechazado' && (
                <div className="mt-3 text-xs text-red-700 font-medium flex items-center gap-2">
                  <RefreshCw className="w-3 h-3" />
                  Puedes editar la información abajo y reenviar para nueva revisión.
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