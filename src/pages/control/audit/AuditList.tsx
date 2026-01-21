import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MultiSelect } from "@/components/ui/multi-select";
import { Search, Filter, CheckCircle2, Eye, Clock, MapPin, Camera, Box, FileText, Mail, MessageSquareText, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { AuditReviewModal } from "./AuditReviewModal";

export default function AuditList() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- ESTADOS DE FILTROS ---
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedExecutionStatus, setSelectedExecutionStatus] = useState<string[]>([]);
  const [selectedAuditStatus, setSelectedAuditStatus] = useState<string[]>(["pendiente"]); // Default: Pendientes

  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Opciones de filtros estáticos
  const executionStatusOptions = [
    { label: "A Tiempo", value: "completada_a_tiempo" },
    { label: "Vencida", value: "completada_vencida" },
    { label: "Completada (Sin tiempo)", value: "completada" },
  ];

  const auditStatusOptions = [
    { label: "Pendiente Revisión", value: "pendiente" },
    { label: "Aprobado", value: "aprobado" },
    { label: "Rechazado", value: "rechazado" },
  ];

  const fetchTasks = async () => {
    setLoading(true);
    
    try {
      let query = supabase
        .from('task_instances')
        .select(`
          *,
          routine_templates (
            id,
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
          pdv (id, nombre, ciudad),
          profiles:completado_por (id, nombre, apellido)
        `)
        // Traemos solo las que ya se completaron (para auditar)
        .in('estado', ['completada', 'completada_a_tiempo', 'completada_vencida']) 
        .order('completado_at', { ascending: false });

      // Aplicar filtro de fechas si existen en la consulta inicial para optimizar
      if (dateFrom) query = query.gte('completado_at', dateFrom);
      if (dateTo) query = query.lte('completado_at', dateTo + 'T23:59:59');

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
  }, [dateFrom, dateTo]); // Recargar si cambian las fechas base

  // --- OPCIONES DINÁMICAS PARA FILTROS (Memoized) ---
  const pdvOptions = useMemo(() => {
    const map = new Map();
    tasks.forEach(t => { if (t.pdv) map.set(t.pdv.id, t.pdv.nombre); });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a,b) => a.label.localeCompare(b.label));
  }, [tasks]);

  const routineOptions = useMemo(() => {
    const map = new Map();
    tasks.forEach(t => { if (t.routine_templates) map.set(t.routine_templates.id, t.routine_templates.nombre); });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a,b) => a.label.localeCompare(b.label));
  }, [tasks]);

  const userOptions = useMemo(() => {
    const map = new Map();
    tasks.forEach(t => { 
      if (t.profiles) {
        map.set(t.profiles.id, `${t.profiles.nombre} ${t.profiles.apellido}`);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a,b) => a.label.localeCompare(b.label));
  }, [tasks]);

  // --- FILTRADO EN MEMORIA ---
  const filteredTasks = tasks.filter(t => {
    // 1. Filtro PDV
    if (selectedPdvs.length > 0 && (!t.pdv || !selectedPdvs.includes(t.pdv.id))) return false;

    // 2. Filtro Rutina
    if (selectedRoutines.length > 0 && (!t.routine_templates || !selectedRoutines.includes(t.routine_templates.id))) return false;

    // 3. Filtro Usuario
    if (selectedUsers.length > 0 && (!t.profiles || !selectedUsers.includes(t.profiles.id))) return false;

    // 4. Filtro Estado Ejecución
    if (selectedExecutionStatus.length > 0 && !selectedExecutionStatus.includes(t.estado)) return false;

    // 5. Filtro Estado Auditoría
    if (selectedAuditStatus.length > 0) {
      // Manejo especial para "pendiente" ya que puede ser null o string 'pendiente'
      const status = t.audit_status || 'pendiente';
      if (!selectedAuditStatus.includes(status)) return false;
    }

    return true;
  });

  const handleReview = (task: any) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const clearFilters = () => {
    setSelectedPdvs([]);
    setSelectedRoutines([]);
    setSelectedUsers([]);
    setSelectedExecutionStatus([]);
    setSelectedAuditStatus(["pendiente"]); // Volver al default útil
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = 
    selectedPdvs.length > 0 || 
    selectedRoutines.length > 0 || 
    selectedUsers.length > 0 || 
    selectedExecutionStatus.length > 0 || 
    (selectedAuditStatus.length > 0 && (selectedAuditStatus.length !== 1 || !selectedAuditStatus.includes('pendiente'))) ||
    dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Auditoría de Calidad</h2>
        <p className="text-muted-foreground">Revisión y aprobación de tareas ejecutadas en campo.</p>
      </div>

      {/* --- PANEL DE FILTROS --- */}
      <Card className="bg-muted/20 border-primary/10">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Filter className="w-4 h-4" /> Filtros Avanzados
            </div>
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFilters} 
                className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <X className="w-3 h-3 mr-1" /> Limpiar Filtros
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            
            {/* Rango de Fechas */}
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                <Input 
                  type="date" 
                  className="h-8 pl-7 text-xs bg-background" 
                  value={dateFrom} 
                  onChange={(e) => setDateFrom(e.target.value)} 
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                <Input 
                  type="date" 
                  className="h-8 pl-7 text-xs bg-background" 
                  value={dateTo} 
                  onChange={(e) => setDateTo(e.target.value)} 
                />
              </div>
            </div>

            {/* Selectores */}
            <div className="space-y-1">
              <Label className="text-xs">Estado Auditoría</Label>
              <MultiSelect 
                options={auditStatusOptions} 
                selected={selectedAuditStatus} 
                onChange={setSelectedAuditStatus} 
                placeholder="Estado..."
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Puntos de Venta</Label>
              <MultiSelect 
                options={pdvOptions} 
                selected={selectedPdvs} 
                onChange={setSelectedPdvs} 
                placeholder="Todos los PDV"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Rutinas</Label>
              <MultiSelect 
                options={routineOptions} 
                selected={selectedRoutines} 
                onChange={setSelectedRoutines} 
                placeholder="Todas las Rutinas"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Ejecución</Label>
              <MultiSelect 
                options={executionStatusOptions} 
                selected={selectedExecutionStatus} 
                onChange={setSelectedExecutionStatus} 
                placeholder="A tiempo / Vencida"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-hidden">
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
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex justify-center items-center gap-2">
                        <Clock className="w-4 h-4 animate-spin text-primary" /> Cargando...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <Search className="w-8 h-8 mb-2 opacity-20" />
                        <p>No se encontraron tareas con los filtros seleccionados.</p>
                      </div>
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