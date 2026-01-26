import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, User, CheckCircle2, XCircle, AlertTriangle, Loader2, FileText, Camera, Package, ChevronRight, Clock, Mail, MessageSquareText } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AuditReviewModalProps {
  task: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AuditReviewModal({ task, open, onOpenChange, onSuccess }: AuditReviewModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [notes, setNotes] = useState("");
  
  // Datos detallados
  const [evidenceFiles, setEvidenceFiles] = useState<any[]>([]);
  const [inventoryRows, setInventoryRows] = useState<any[]>([]);

  // Configuración de la rutina (alias para facilitar lectura)
  const config = task?.routine_templates || {};

  useEffect(() => {
    if (open && task) {
      fetchTaskDetails();
      setNotes(task.audit_notas || "");
    }
  }, [open, task]);

  const fetchTaskDetails = async () => {
    setIsLoadingDetails(true);
    try {
      // 1. Cargar Evidencias (Fotos y Archivos)
      const { data: files } = await supabase
        .from('evidence_files')
        .select('*')
        .eq('task_id', task.id);
      
      if (files) setEvidenceFiles(files);

      // 2. Cargar Inventario (Si aplica)
      if (config.requiere_inventario) {
        const { data: inv, error: invError } = await supabase
          .from('inventory_submission_rows')
          .select('*, inventory_products(nombre, codigo_sku, unidad)')
          .eq('task_id', task.id);
        
        if (invError) {
          console.error("Error loading inventory:", invError);
        } else if (inv) {
          setInventoryRows(inv);
        }
      }

    } catch (error) {
      console.error("Error loading details:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleAudit = async (status: 'approve' | 'reject') => {
    if (status === 'reject' && !notes.trim()) {
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

      // 1. Actualizar estado de la tarea
      const updateData = {
        audit_status: status === 'approve' ? 'aprobado' : 'rechazado',
        audit_at: new Date().toISOString(),
        audit_by: user.id,
        audit_notas: notes
      };

      const { error } = await supabase
        .from('task_instances')
        .update(updateData)
        .eq('id', task.id);

      if (error) throw error;

      // 2. Si es RECHAZO -> Enviar Mensaje Directo al usuario
      const targetUserId = task.profiles?.id || task.completado_por || task.responsable_id;

      if (status === 'reject') {
        if (!targetUserId) {
           console.error("CRITICAL: No target user found for rejection message", task);
        } else {
          const messageBody = `La rutina "${config.nombre}" ejecutada el ${format(new Date(task.completado_at), "dd/MM/yyyy")} ha sido rechazada.\n\nMotivo de auditoría:\n"${notes}"\n\nPor favor, revisa las observaciones y realiza las correcciones necesarias en la siguiente ejecución.`;

          await supabase.rpc('send_broadcast_message', {
            p_asunto: `⚠️ Rutina Rechazada: ${config.nombre}`,
            p_cuerpo: messageBody,
            p_tipo: 'mensaje',
            p_prioridad: 'alta',
            p_requiere_confirmacion: true,
            p_recipient_type: 'user',
            p_recipient_id: String(targetUserId)
          });
        }
      }

      toast({ 
        title: status === 'approve' ? "Tarea Aprobada" : "Tarea Rechazada", 
        description: status === 'reject' 
          ? "Se ha notificado al usuario con el motivo del rechazo." 
          : "La auditoría se ha registrado correctamente." 
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

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('evidence').getPublicUrl(path);
    return data.publicUrl;
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col p-0 gap-0">
        
        {/* Header Fijo */}
        <DialogHeader className="p-6 pb-4 border-b bg-muted/10 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {/* Badge de Tiempo */}
              {task.estado === 'completada_a_tiempo' ? (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200 gap-1 pl-1">
                  <CheckCircle2 className="w-3 h-3" /> A Tiempo
                </Badge>
              ) : task.estado === 'completada_vencida' ? (
                <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200 gap-1 pl-1">
                  <Clock className="w-3 h-3" /> Vencida
                </Badge>
              ) : (
                <Badge variant="secondary">Completada</Badge>
              )}

              <Badge variant="outline" className="capitalize border-primary/20 text-primary">
                {config.prioridad}
              </Badge>
              
              {/* Badge de Auditoría */}
              {task.audit_status && task.audit_status !== 'pendiente' && (
                <Badge className={getStatusColor(task.audit_status)}>
                  {task.audit_status.toUpperCase()}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              ID: {task.id.slice(0,8)}
            </span>
          </div>
          <DialogTitle className="text-xl flex items-center gap-2">
            {config.nombre}
          </DialogTitle>
          <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" /> {task.profiles?.nombre} {task.profiles?.apellido}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {task.pdv?.nombre}
            </span>
          </div>
        </DialogHeader>

        {/* Scrollable Content - MAIN SCROLL - NO RESTRICTIONS INSIDE */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6">
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="details">Detalles de Ejecución</TabsTrigger>
                <TabsTrigger value="evidence">
                  Evidencia y Adjuntos 
                  {evidenceFiles.length > 0 && <Badge className="ml-2 h-5 px-1.5" variant="secondary">{evidenceFiles.length}</Badge>}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-6">
                
                {/* 1. Información General */}
                <div className="grid grid-cols-2 gap-4 text-sm border p-4 rounded-lg bg-card">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs uppercase">Fecha Programada</Label>
                    <p className="font-medium">{format(new Date(task.fecha_programada), "PPP", { locale: es })}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs uppercase">Fecha Ejecución</Label>
                    <p className="font-medium">
                      {task.completado_at 
                        ? format(new Date(task.completado_at), "PPP p", { locale: es }) 
                        : <span className="text-orange-600">No completada</span>}
                    </p>
                  </div>
                </div>

                {/* 2. Notas/Comentarios del Usuario */}
                {task.comentario && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                      <MessageSquareText className="w-3 h-3" /> Notas del Ejecutor
                    </Label>
                    <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-md text-sm text-blue-900">
                      "{task.comentario}"
                    </div>
                  </div>
                )}

                {/* 3. GPS */}
                {config.gps_obligatorio && (
                  <div className={`p-4 rounded-lg border flex items-start gap-3 ${task.gps_en_rango ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    {task.gps_en_rango ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className={`font-semibold text-sm ${task.gps_en_rango ? 'text-green-800' : 'text-red-800'}`}>
                        {task.gps_en_rango ? "Ubicación Validada Correctamente" : "Alerta: Ubicación Fuera de Rango"}
                      </h4>
                      <div className="text-xs mt-1 opacity-90">
                        <p>Coordenadas: {task.gps_latitud?.toFixed(5) || 'N/A'}, {task.gps_longitud?.toFixed(5) || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Inventario - FULLY EXPANDED TABLE */}
                {config.requiere_inventario && (
                  <div className="border rounded-lg bg-card shadow-sm flex flex-col">
                    <div className="bg-muted/30 px-4 py-3 border-b flex justify-between items-center shrink-0">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Package className="w-4 h-4 text-orange-600" /> Registro de Inventario
                      </h4>
                      <Badge variant="outline" className="text-xs">{inventoryRows.length} Productos</Badge>
                    </div>
                    
                    {isLoadingDetails ? (
                      <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground"/></div>
                    ) : inventoryRows.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <p>No hay datos de inventario registrados.</p>
                      </div>
                    ) : (
                      // NO overflow-hidden or fixed height here
                      <div className="w-full">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 border-b">
                            <tr>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Producto</th>
                              <th className="text-center px-2 py-3 font-medium text-muted-foreground w-[100px]">Físico</th>
                              <th className="text-center px-2 py-3 font-medium text-muted-foreground w-[100px]">Sistema</th>
                              <th className="text-right px-4 py-3 font-medium text-muted-foreground w-[100px]">Diferencia</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {inventoryRows.map((row) => (
                              <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-slate-900">{row.inventory_products?.nombre}</div>
                                  <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5">
                                    <span className="bg-muted px-1.5 py-0.5 rounded">SKU: {row.inventory_products?.codigo_sku || '-'}</span>
                                    <span className="bg-muted px-1.5 py-0.5 rounded">Unidad: {row.inventory_products?.unidad || '-'}</span>
                                  </div>
                                </td>
                                <td className="text-center px-2 py-3">
                                  <span className="font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                                    {row.fisico}
                                  </span>
                                </td>
                                <td className="text-center px-2 py-3">
                                  <span className="text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                    {row.esperado}
                                  </span>
                                </td>
                                <td className="text-right px-4 py-3">
                                  <span className={`font-bold px-2 py-1 rounded ${
                                    row.diferencia === 0 
                                      ? 'text-green-700 bg-green-50' 
                                      : row.diferencia > 0 
                                        ? 'text-blue-700 bg-blue-50' 
                                        : 'text-red-700 bg-red-50'
                                  }`}>
                                    {row.diferencia > 0 ? '+' : ''}{row.diferencia}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. Correos Enviados/Respondidos */}
                {(config.enviar_email || config.responder_email) && (
                  <div className="p-4 rounded-lg border bg-blue-50/30 border-blue-100">
                    <h4 className="font-semibold text-sm flex items-center gap-2 mb-2 text-blue-900">
                      <Mail className="w-4 h-4" /> Gestión de Correos
                    </h4>
                    <div className="grid gap-2">
                      {config.enviar_email && (
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-600" /> Confirmado envío de correo
                        </div>
                      )}
                      {config.responder_email && (
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-600" /> Confirmado respuesta de correo
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="evidence" className="space-y-6">
                {isLoadingDetails ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground"/></div>
                ) : evidenceFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg bg-muted/10">
                    <Camera className="w-10 h-10 text-muted-foreground mb-2 opacity-50" />
                    <p className="text-sm text-muted-foreground">No se adjuntaron evidencias.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {evidenceFiles.map((file) => (
                      file.tipo === 'foto' ? (
                        <div key={file.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-black/5 cursor-pointer">
                          <img 
                            src={getPublicUrl(file.storage_path)} 
                            alt="Evidencia" 
                            className="object-cover w-full h-full hover:scale-105 transition-transform"
                            onClick={() => window.open(getPublicUrl(file.storage_path), '_blank')}
                          />
                        </div>
                      ) : (
                        <div key={file.id} className="col-span-full flex items-center p-3 border rounded-lg bg-blue-50/50 hover:bg-blue-50 transition-colors cursor-pointer"
                             onClick={() => window.open(getPublicUrl(file.storage_path), '_blank')}>
                          <FileText className="w-8 h-8 text-blue-500 mr-3" />
                          <div className="overflow-hidden">
                            <p className="text-sm font-medium truncate">{file.filename}</p>
                            <p className="text-xs text-muted-foreground flex items-center">
                              Clic para descargar <ChevronRight className="w-3 h-3 ml-1"/>
                            </p>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>

        {/* Footer de Acción Fijo */}
        <div className="p-6 border-t bg-muted/10 mt-auto shrink-0">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="audit-notes">Notas de Auditoría</Label>
              <Textarea 
                id="audit-notes"
                placeholder="Escribe tus observaciones (Obligatorio para rechazar)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!!task.audit_status && task.audit_status !== 'pendiente'}
                className="bg-background resize-none h-20"
              />
            </div>

            {(!task.audit_status || task.audit_status === 'pendiente') ? (
              <div className="flex gap-3 pt-2">
                <Button 
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white" 
                  onClick={() => handleAudit('approve')}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Aprobar
                </Button>
                <Button 
                  className="flex-1" 
                  variant="destructive"
                  onClick={() => handleAudit('reject')}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Rechazar
                </Button>
              </div>
            ) : (
              <div className={`text-center text-sm py-2 px-4 rounded border font-medium ${
                task.audit_status === 'aprobado' 
                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                Auditoría cerrada: {task.audit_status.toUpperCase()}
              </div>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}