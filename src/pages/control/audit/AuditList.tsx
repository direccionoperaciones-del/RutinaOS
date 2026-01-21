import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, CheckCircle2, AlertTriangle, Eye, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { AuditReviewModal } from "./AuditReviewModal";

export default function AuditList() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("pendiente");
  
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    
    try {
      let query = supabase
        .from('task_instances')
        .select(`
          *,
          routine_templates (nombre, prioridad, gps_obligatorio),
          pdv (nombre, ciudad),
          profiles:completado_por (nombre, apellido)
        `)
        // Filtramos solo las tareas que ya fueron completadas (en cualquiera de sus estados finales)
        .in('estado', ['completada_a_tiempo', 'completada_vencida', 'completada']) 
        .order('completado_at', { ascending: false });

      if (statusFilter !== 'todos') {
        if (statusFilter === 'pendiente') {
           // Traer las que no tienen estado o están explícitamente pendientes
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
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="aprobado">Aprobados</SelectItem>
                <SelectItem value="rechazado">Rechazados</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha Ejecución</TableHead>
                  <TableHead>Rutina</TableHead>
                  <TableHead>PDV</TableHead>
                  <TableHead>Ejecutado Por</TableHead>
                  <TableHead>GPS</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell>
                  </TableRow>
                ) : filteredTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay tareas que coincidan con los filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {task.completado_at ? format(new Date(task.completado_at), "dd/MM HH:mm") : '-'}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {task.routine_templates?.nombre}
                        {task.routine_templates?.prioridad === 'critica' && (
                           <Badge variant="destructive" className="ml-2 text-[10px] h-5">Crítica</Badge>
                        )}
                      </TableCell>
                      <TableCell>{task.pdv?.nombre}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {task.profiles ? `${task.profiles.nombre} ${task.profiles.apellido}` : 'Desconocido'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {task.gps_en_rango === true && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {task.gps_en_rango === false && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                        {task.gps_en_rango === null && <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {task.audit_status === 'aprobado' && <Badge className="bg-green-100 text-green-800 border-green-200">Aprobado</Badge>}
                        {task.audit_status === 'rechazado' && <Badge className="bg-red-100 text-red-800 border-red-200">Rechazado</Badge>}
                        {(!task.audit_status || task.audit_status === 'pendiente') && <Badge variant="outline">Pendiente</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleReview(task)}>
                          <Eye className="w-4 h-4 mr-2" /> Revisar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
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