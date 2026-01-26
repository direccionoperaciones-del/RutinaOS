import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      const { data: files } = await supabase.from('evidence_files').select('*').eq('task_id', task.id);
      if (files) setEvidenceFiles(files);

      if (config.requiere_inventario) {
        const { data: inv } = await supabase
          .from('inventory_submission_rows')
          .select('*, inventory_products(nombre, codigo_sku, unidad)')
          .eq('task_id', task.id);
        if (inv) setInventoryRows(inv);
      }
    } catch (error) {
      console.error("Error loading details:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleAudit = async (status: 'approved' | 'rejected') => {
    // Validación estricta en cliente
    if (status === 'rejected' && !notes.trim()) {
      toast({ 
        variant: "destructive", 
        title: "Nota requerida", 
        description: "Para rechazar una tarea, es obligatorio indicar el motivo en las notas." 
      });
      return;
    }

    setIsLoading(true);
    try {
      // Llamada a Edge Function
      const { data, error } = await supabase.functions.invoke('audit-execution', {
        body: {
          taskId: task.id,
          status: status,
          note: notes
        }
      });

      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      toast({ 
        title: status === 'approved' ? "Tarea Aprobada" : "Tarea Rechazada", 
        description: status === 'rejected' 
          ? "Se ha notificado al ejecutor sobre el rechazo." 
          : "Auditoría registrada exitosamente." 
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Error al procesar la auditoría." });
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
      <DialogContent className="sm:max-w-[800px] h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-none sm:border shadow-xl bg-background">
        
        {/* HEADER */}
        <DialogHeader className="p-6 pb-4 border-b bg-muted/10 shrink-0 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Badges de estado de ejecución */}
              {task.estado === 'completada_a_tiempo' ? (
                <Badge className="bg-green-100 text-green-800 border-green-200 gap-1 pl-1"><CheckCircle2 className="w-3 h-3" /> A Tiempo</Badge>
              ) : task.estado === 'completada_vencida' ? (
                <Badge className="bg-red-100 text-red-800 border-red-200 gap-1 pl-1"><Clock className="w-3 h-3" /> Vencida</Badge>
              ) : (
                <Badge variant="secondary">Completada</Badge>
              )}
              
              {/* Badge de Auditoría */}
              {task.audit_status && task.audit_status !== 'pendiente' && (
                <Badge className={getStatusColor(task.audit_status)}>
                  {task.audit_status.toUpperCase()}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground font-mono hidden sm:inline-block">ID: {task.id.slice(0,8)}</span>
          </div>
          
          <div>
            <DialogTitle className="text-xl flex items-center gap-2">{config.nombre}</DialogTitle>
            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {task.profiles?.nombre} {task.profiles?.apellido}</span>
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {task.pdv?.nombre}</span>
            </div>
          </div>
        </DialogHeader>

        {/* BODY */}
        <ScrollArea className="flex-1 min-h-0 w-full">
          <div className="p-6">
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="details">Detalles</TabsTrigger>
                <TabsTrigger value="evidence">Evidencia ({evidenceFiles.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-6 mt-0">
                {/* Info General Grid */}
                <div className="grid grid-cols-2 gap-4 text-sm border p-4 rounded-lg bg-card">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs uppercase">Programada</Label>
                    <p className="font-medium">{format(new Date(task.fecha_programada), "PPP", { locale: es })}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs uppercase">Ejecutada</Label>
                    <p className="font-medium">
                      {task.completado_at ? format(new Date(task.completado_at), "PPP p", { locale: es }) : <span className="text-orange-600">--</span>}
                    </p>
                  </div>
                </div>

                {/* Comentarios del ejecutor */}
                {task.comentario && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                      <MessageSquareText className="w-3 h-3" /> Nota del Ejecutor
                    </Label>
                    <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-md text-sm text-blue-900">"{task.comentario}"</div>
                  </div>
                )}

                {/* Inventario */}
                {config.requiere_inventario && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Package className="h-5 w-5 text-orange-600" /><h3 className="font-semibold text-sm">Inventario</h3></div>
                      <Badge variant="secondary">{inventoryRows.length} Items</Badge>
                    </div>
                    {isLoadingDetails ? (
                      <div className="p-4 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden bg-card">
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow>
                              <TableHead>Producto</TableHead>
                              <TableHead className="text-center w-[80px]">Físico</TableHead>
                              <TableHead className="text-center w-[80px]">Sistema</TableHead>
                              <TableHead className="text-center w-[80px]">Dif</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {inventoryRows.map((item, idx) => (
                              <TableRow key={item.id || idx}>
                                <TableCell>
                                  <div className="font-medium text-sm">{item.inventory_products?.nombre}</div>
                                  <div className="text-[10px] text-muted-foreground">SKU: {item.inventory_products?.codigo_sku}</div>
                                </TableCell>
                                <TableCell className="text-center font-bold text-blue-700 bg-blue-50">{item.fisico}</TableCell>
                                <TableCell className="text-center text-muted-foreground">{item.esperado}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline" className={item.diferencia === 0 ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}>
                                    {item.diferencia > 0 ? '+' : ''}{item.diferencia}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="evidence" className="space-y-6">
                {isLoadingDetails ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin"/></div>
                ) : evidenceFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg bg-muted/10">
                    <Camera className="w-10 h-10 text-muted-foreground mb-2 opacity-50" />
                    <p className="text-sm text-muted-foreground">Sin evidencias adjuntas.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {evidenceFiles.map((file) => (
                      file.tipo === 'foto' ? (
                        <div key={file.id} className="relative group aspect-square rounded-lg overflow-hidden border cursor-pointer" onClick={() => window.open(getPublicUrl(file.storage_path), '_blank')}>
                          <img src={getPublicUrl(file.storage_path)} className="object-cover w-full h-full hover:scale-105 transition-transform" />
                        </div>
                      ) : (
                        <div key={file.id} className="col-span-full flex items-center p-3 border rounded-lg bg-blue-50/50 cursor-pointer" onClick={() => window.open(getPublicUrl(file.storage_path), '_blank')}>
                          <FileText className="w-8 h-8 text-blue-500 mr-3" />
                          <div className="overflow-hidden">
                            <p className="text-sm font-medium truncate">{file.filename}</p>
                            <p className="text-xs text-muted-foreground flex items-center">Descargar <ChevronRight className="w-3 h-3 ml-1"/></p>
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

        {/* FOOTER */}
        <div className="p-6 border-t bg-muted/10 mt-auto shrink-0">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="audit-notes" className="flex justify-between">
                Notas de Auditoría
                <span className="text-xs font-normal text-muted-foreground">* Obligatorio para rechazar</span>
              </Label>
              <Textarea 
                id="audit-notes"
                placeholder="Escribe tus observaciones aquí..."
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
                  onClick={() => handleAudit('approved')}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Aprobar
                </Button>
                <Button 
                  className="flex-1" 
                  variant="destructive"
                  onClick={() => handleAudit('rejected')}
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