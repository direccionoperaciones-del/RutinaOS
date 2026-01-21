import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, CheckCircle2, AlertTriangle, Eye, Clock, MapPin, Camera, Box, FileText, Mail, MessageSquareText } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { AuditReviewModal } from "./AuditReviewModal";

export default function AuditList() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos"); // Default cambiado a 'todos'
  
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    
    try {
      let query = supabase
        .from('task_instances')
        .select(`
          *,
          routine_templates (
            nombre, 
            prioridad, 
            gps_obligatorio, 
            fotos_obligatorias, 
            requiere_inventario,
            comentario_obligatorio,
            archivo_obligatorio,
            enviar_email,
            responder_email
          ),
          pdv (nombre, ciudad),
          profiles:completado_por (nombre, apellido)
        `)
        .in('estado', ['completada', 'completada_a_tiempo', 'completada_vencida']) 
        .order('completado_at', { ascending: false });

      if (statusFilter !== 'todos') {
        if (statusFilter === 'pendiente') {
           query = query.or('audit_status.is.null,audit_status.eq.pendiente');
        } else {
           query = query.eq('audit_status', statusFilter);
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      setTasks(data || []);
    } catch (error: any) {
      console.error("Error cargando auditoría:", error);
      toast({ 
        variant: "destructive", 
        title: "Error de carga", 
        description: error.message || "No se pudieron cargar las tareas." 
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [statusFilter]);

  const handleReview = (task: any) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const filteredTasks = tasks.filter(t => {
    const searchLower = searchTerm.toLowerCase();
    const pdvName = t.pdv?.nombre?.toLowerCase() || "";
    const routineName = t.routine_templates?.nombre?.toLowerCase() || "";
    const userName = t.profiles ? `${t.profiles.nombre} ${t.profiles.apellido}`.toLowerCase() : "";
    
    return pdvName.includes(searchLower) || routineName.includes(searchLower) || userName.includes(searchLower);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Auditoría de Calidad</h2>
        <p className="text-muted-foreground">Revisión y aprobación de tareas ejecutadas en campo.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row gap-4 space-y-0">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por PDV, Rutina o Usuario..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-[200px]">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Estado Auditoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="aprobado">Aprobados</SelectItem>
                <SelectItem value="rechazado">Rechazados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Rutina / Requisitos</TableHead>
                  <TableHead>PDV</TableHead>
                  <TableHead>Ejecución</TableHead>
                  <TableHead>Auditoría</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell>
                  </TableRow>
                ) : filteredTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No hay tareas que coincidan con los filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTasks.map((task) => {
                    const r = task.routine_templates || {};
                    return (
                      <TableRow key={task.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium">{task.completado_at ? format(new Date(task.completado_at), "dd MMM") : '-'}</span>
                            <span className="text-muted-foreground">{task.completado_at ? format(new Date(task.completado_at), "HH:mm") : '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="font-medium flex items-center gap-2">
                              {r.nombre}
                              {r.prioridad === 'critica' && (
                                <Badge variant="destructive" className="text-[9px] h-4 px-1">Crítica</Badge>
                              )}
                            </div>
                            {/* Iconos de Requisitos */}
                            <div className="flex gap-1 text-muted-foreground">
                              {r.gps_obligatorio && <MapPin className="w-3 h-3 text-blue-500" title="GPS" />}
                              {r.fotos_obligatorias && <Camera className="w-3 h-3 text-purple-500" title="Fotos" />}
                              {r.requiere_inventario && <Box className="w-3 h-3 text-orange-500" title="Inventario" />}
                              {r.archivo_obligatorio && <FileText className="w-3 h-3 text-cyan-500" title="Archivo" />}
                              {(r.enviar_email || r.responder_email) && <Mail className="w-3 h-3 text-pink-500" title="Email" />}
                              {r.comentario_obligatorio && <MessageSquareText className="w-3 h-3 text-yellow-500" title="Comentario" />}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-sm">
                            <span>{task.pdv?.nombre}</span>
                            <span className="text-xs text-muted-foreground">
                              {task.profiles ? `${task.profiles.nombre} ${task.profiles.apellido}` : 'Desconocido'}
                            </span>
                          </div>
                        </TableCell>
                        
                        {/* Estado de Ejecución (Tiempo) */}
                        <TableCell>
                          {task.estado === 'completada_a_tiempo' && (
                            <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">A Tiempo</Badge>
                          )}
                          {task.estado === 'completada_vencida' && (
                            <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100">Vencida</Badge>
                          )}
                          {task.estado === 'completada' && (
                            <Badge variant="outline">Completada</Badge>
                          )}
                        </TableCell>

                        {/* Estado de Auditoría */}
                        <TableCell>
                          {task.audit_status === 'aprobado' && <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">Aprobado</Badge>}
                          {task.audit_status === 'rechazado' && <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">Rechazado</Badge>}
                          {(!task.audit_status || task.audit_status === 'pendiente') && <Badge variant="outline" className="text-gray-500">Pendiente</Badge>}
                        </TableCell>

                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleReview(task)}>
                            <Eye className="w-4 h-4 mr-2" /> Revisar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AuditReviewModal 
        task={selectedTask}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSuccess={fetchTasks}
      />
    </div>
  );
}