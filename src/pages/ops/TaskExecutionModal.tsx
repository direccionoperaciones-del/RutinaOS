import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { calculateDistance } from "@/utils/geo";
import { MapPin, Camera, CheckCircle2, AlertTriangle, Loader2, UploadCloud, Trash2, Edit, FileText, Mail, Paperclip, CheckSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isGpsValid, setIsGpsValid] = useState(false);
  const [comentario, setComentario] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  
  // Estados para nuevos requisitos
  const [emailSentConfirmed, setEmailSentConfirmed] = useState(false);
  const [emailRespondedConfirmed, setEmailRespondedConfirmed] = useState(false);
  
  // Configuración de la rutina
  const rutina = task?.routine_templates;
  const pdv = task?.pdv;
  
  const requiresGps = rutina?.gps_obligatorio;
  const requiresComment = rutina?.comentario_obligatorio;
  const requiresPhotos = rutina?.fotos_obligatorias;
  const requiresFile = rutina?.archivo_obligatorio;
  const requiresSendEmail = rutina?.enviar_email;
  const requiresRespondEmail = rutina?.responder_email;
  const requiresInventory = rutina?.requiere_inventario;

  const pdvRadio = pdv?.radio_gps || 100;

  useEffect(() => {
    if (open && task) {
      // Reset states
      setCurrentLocation(null);
      setDistance(null);
      setGpsError(null);
      setIsGpsValid(!requiresGps);
      setComentario("");
      setUploadedFiles([]);
      setEmailSentConfirmed(false);
      setEmailRespondedConfirmed(false);
      fetchEvidence();
    }
  }, [open, requiresGps, task]);

  const fetchEvidence = async () => {
    if (!task) return;
    const { data } = await supabase
      .from('evidence_files')
      .select('*')
      .eq('task_id', task.id);
    setUploadedFiles(data || []);
  };

  const getLocation = () => {
    setIsLoading(true);
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError("Tu navegador no soporta geolocalización.");
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        
        setCurrentLocation({ lat: userLat, lng: userLng });

        if (pdv?.latitud && pdv?.longitud) {
          const dist = calculateDistance(userLat, userLng, pdv.latitud, pdv.longitud);
          setDistance(Math.round(dist));
          
          if (dist <= pdvRadio) {
            setIsGpsValid(true);
            toast({ title: "Ubicación verificada", description: "Estás dentro del rango permitido." });
          } else {
            setIsGpsValid(false);
            setGpsError(`Estás a ${Math.round(dist)}m del PDV. Máximo permitido: ${pdvRadio}m.`);
          }
        } else {
          if (requiresGps) {
            setGpsError("El PDV no tiene coordenadas configuradas.");
            setIsGpsValid(false);
          }
        }
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        setGpsError("No se pudo obtener tu ubicación. Verifica los permisos.");
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'foto' | 'archivo') => {
    const file = event.target.files?.[0];
    if (!file || !task) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${task.id}/${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('evidence_files')
        .insert({
          task_id: task.id,
          tipo: type,
          filename: file.name,
          storage_path: fileName,
          size_bytes: file.size,
          mime_type: file.type
        });

      if (dbError) throw dbError;

      toast({ title: "Archivo subido", description: "La evidencia se ha guardado correctamente." });
      fetchEvidence();
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error al subir", description: error.message || "Error al subir archivo." });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleDeleteEvidence = async (id: string, path: string) => {
    if (!confirm("¿Borrar esta evidencia?")) return;
    
    const { error: storageError } = await supabase.storage.from('evidence').remove([path]);
    if (storageError) console.error(storageError);

    const { error } = await supabase.from('evidence_files').delete().eq('id', id);
    
    if (!error) {
      setUploadedFiles(prev => prev.filter(f => f.id !== id));
      toast({ title: "Eliminado", description: "Evidencia borrada." });
    }
  };

  const handleComplete = async () => {
    // Validaciones
    if (requiresGps && !isGpsValid) {
      toast({ variant: "destructive", title: "Bloqueo de seguridad", description: "Debes validar tu ubicación GPS antes de finalizar." });
      return;
    }

    if (requiresPhotos) {
      const photoCount = uploadedFiles.filter(f => f.tipo === 'foto').length;
      if (photoCount < (rutina.min_fotos || 1)) {
        toast({ variant: "destructive", title: "Evidencia faltante", description: `Debes subir al menos ${rutina.min_fotos || 1} foto(s).` });
        return;
      }
    }

    if (requiresFile) {
      const fileCount = uploadedFiles.filter(f => f.tipo === 'archivo').length;
      if (fileCount === 0) {
        toast({ variant: "destructive", title: "Archivo faltante", description: "Debes adjuntar el documento requerido." });
        return;
      }
    }

    if (requiresSendEmail && !emailSentConfirmed) {
      toast({ variant: "destructive", title: "Requisito pendiente", description: "Debes confirmar que enviaste el correo electrónico." });
      return;
    }

    if (requiresRespondEmail && !emailRespondedConfirmed) {
      toast({ variant: "destructive", title: "Requisito pendiente", description: "Debes confirmar que respondiste el correo electrónico." });
      return;
    }

    if (requiresComment && !comentario.trim()) {
      toast({ variant: "destructive", title: "Comentario requerido", description: "Esta rutina exige ingresar notas de ejecución." });
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { error } = await supabase
        .from('task_instances')
        .update({
          estado: 'completada', 
          completado_at: new Date().toISOString(),
          completado_por: user.id,
          gps_latitud: currentLocation?.lat,
          gps_longitud: currentLocation?.lng,
          gps_en_rango: isGpsValid,
          comentario: comentario // Asumiendo que agregamos esta columna o se usa audit_notas
        })
        .eq('id', task.id);

      if (error) throw error;

      toast({ title: "¡Tarea Completada!", description: "La ejecución se ha registrado exitosamente." });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('evidence').getPublicUrl(path);
    return data.publicUrl;
  };

  // Filtros de evidencias
  const photos = uploadedFiles.filter(f => f.tipo === 'foto');
  const docs = uploadedFiles.filter(f => f.tipo === 'archivo');

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
          <DialogDescription>
            {rutina.descripcion}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          
          {/* 1. GPS */}
          {requiresGps && (
            <div className={`p-4 rounded-lg border ${isGpsValid ? 'bg-green-50 border-green-200' : 'bg-muted/50'}`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4" /> Validación de Ubicación
                </h4>
                <Badge variant="destructive" className="text-[10px] h-5">Requerido</Badge>
              </div>
              
              <div className="text-sm text-muted-foreground mb-4">
                {currentLocation ? (
                  <>
                    <p>Detectado: {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}</p>
                    {distance !== null && <p className="font-medium mt-1">Distancia al PDV: {distance} metros</p>}
                  </>
                ) : (
                  <p>Se requiere tu ubicación actual para validar la presencia en el PDV.</p>
                )}
              </div>

              {gpsError && (
                <div className="flex items-center gap-2 text-destructive text-sm mb-3 font-medium bg-destructive/10 p-2 rounded">
                  <AlertTriangle className="w-4 h-4" /> {gpsError}
                </div>
              )}

              {isGpsValid ? (
                 <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                   <CheckCircle2 className="w-4 h-4" /> Ubicación Válida
                 </div>
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={getLocation} disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <MapPin className="w-4 h-4 mr-2"/>}
                  Validar Ubicación
                </Button>
              )}
            </div>
          )}

          {/* 2. CONFIRMACIONES DE CORREO */}
          {(requiresSendEmail || requiresRespondEmail) && (
            <div className="p-4 rounded-lg border bg-blue-50/50 border-blue-100 space-y-4">
              <h4 className="font-semibold flex items-center gap-2 text-sm text-blue-900">
                <Mail className="w-4 h-4" /> Gestión de Correos
              </h4>
              
              {requiresSendEmail && (
                <div className="flex items-start space-x-2">
                  <Checkbox 
                    id="chk-send-email" 
                    checked={emailSentConfirmed}
                    onCheckedChange={(c) => setEmailSentConfirmed(!!c)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label htmlFor="chk-send-email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Confirmar envío de correo
                    </label>
                    <p className="text-sm text-muted-foreground">Declaro que he enviado el correo electrónico solicitado en la rutina.</p>
                  </div>
                </div>
              )}

              {requiresRespondEmail && (
                <div className="flex items-start space-x-2">
                  <Checkbox 
                    id="chk-respond-email"
                    checked={emailRespondedConfirmed}
                    onCheckedChange={(c) => setEmailRespondedConfirmed(!!c)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label htmlFor="chk-respond-email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Confirmar respuesta de correo
                    </label>
                    <p className="text-sm text-muted-foreground">Declaro que he respondido los correos pendientes relacionados.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. DOCUMENTOS ADJUNTOS */}
          {requiresFile && (
            <div className="p-4 rounded-lg border bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold flex items-center gap-2 text-sm">
                  <Paperclip className="w-4 h-4" /> Adjuntar Archivo
                </h4>
                <Badge variant="destructive" className="text-[10px]">Requerido</Badge>
              </div>
              
              <div className="space-y-4">
                {docs.length === 0 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="relative" disabled={isUploading}>
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <UploadCloud className="w-4 h-4 mr-2"/>}
                      Subir Documento
                      <input 
                        type="file" 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        onChange={(e) => handleFileUpload(e, 'archivo')}
                        disabled={isUploading}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                      />
                    </Button>
                    <span className="text-xs text-muted-foreground">PDF, Excel, Word...</span>
                  </div>
                )}

                {docs.length > 0 && (
                  <div className="space-y-2">
                    {docs.map(file => (
                      <div key={file.id} className="flex items-center justify-between p-2 bg-background border rounded text-sm">
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-4 h-4 text-blue-500" />
                          <span className="truncate max-w-[200px]">{file.filename}</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-destructive"
                          onClick={() => handleDeleteEvidence(file.id, file.storage_path)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. EVIDENCIA FOTOGRÁFICA */}
          <div className="p-4 rounded-lg border bg-muted/20">
             <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold flex items-center gap-2 text-sm">
                <Camera className="w-4 h-4" /> Evidencia Fotográfica
              </h4>
              {requiresPhotos ? (
                <Badge variant="secondary" className="text-[10px]">Mínimo {rutina.min_fotos || 1}</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Opcional</Badge>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-center w-full">
                <label 
                  htmlFor="photo-upload" 
                  className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-muted/50 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    {isUploading ? (
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    ) : (
                      <UploadCloud className="w-8 h-8 text-muted-foreground mb-2" />
                    )}
                    <p className="text-sm text-muted-foreground">
                      {isUploading ? "Subiendo..." : "Toca para subir foto"}
                    </p>
                  </div>
                  <input id="photo-upload" type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'foto')} disabled={isUploading} />
                </label>
              </div>

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map(file => (
                    <div key={file.id} className="relative group aspect-square rounded-md overflow-hidden border bg-background">
                      <img 
                        src={getPublicUrl(file.storage_path)} 
                        className="object-cover w-full h-full" 
                        alt="Evidencia"
                      />
                      <button 
                        onClick={() => handleDeleteEvidence(file.id, file.storage_path)}
                        className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 5. INVENTARIO (Placeholder) */}
          {requiresInventory && (
            <div className="p-4 rounded-lg border bg-orange-50/50 border-orange-100">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2 text-sm text-orange-800">
                  <CheckSquare className="w-4 h-4" /> Toma de Inventario
                </h4>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled>
                  Iniciar Conteo
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                * Módulo de inventario en construcción. Se permite finalizar sin conteo por ahora.
              </p>
            </div>
          )}

          {/* 6. COMENTARIOS */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Notas de ejecución</Label>
              {requiresComment && <span className="text-xs text-destructive font-medium">* Requerido</span>}
            </div>
            <Textarea 
              placeholder={requiresComment ? "Ingrese sus observaciones obligatorias..." : "¿Alguna novedad o incidencia?"}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className={requiresComment && !comentario ? "border-red-200 focus-visible:ring-red-500" : ""}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={handleComplete} 
            disabled={isLoading || isUploading || (requiresGps && !isGpsValid)}
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