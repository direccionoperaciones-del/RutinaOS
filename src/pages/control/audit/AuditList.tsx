import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MultiSelect } from "@/components/ui/multi-select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Search, Filter, CheckCircle2, Eye, Clock, MapPin, Camera, Box, FileText, Mail, MessageSquareText, CalendarIcon, X, User } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { AuditReviewModal } from "./AuditReviewModal";
import { calculateTaskDeadline } from "@/pages/ops/logic/task-deadline";
import { openDatePicker } from "@/lib/utils";

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
  const [selectedAuditStatus, setSelectedAuditStatus] = useState<string[]>(["pendiente"]);

  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
            id, nombre, prioridad, frecuencia, vencimiento_dia_mes,
            corte_1_limite, corte_2_limite, gps_obligatorio, 
            fotos_obligatorias, requiere_inventario, comentario_obligatorio,
            archivo_obligatorio, enviar_email, responder_email
          ),
          pdv (id, nombre, ciudad),
          profiles:completado_por (id, nombre, apellido)
        `)
        .in('estado', ['completada', 'completada_a_tiempo', 'completada_vencida']) 
        .order('completado_at', { ascending: false });

      if (dateFrom) query = query.gte('completado_at', dateFrom);
      if (dateTo) query = query.lte('completado_at', dateTo + 'T23:59:59');

      const { data, error } = await query;
      if (error) throw error;
      setTasks(data || []);
    } catch (error: any) {
      console.error("Error cargando auditoría:", error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); }, [dateFrom, dateTo]);

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
    tasks.forEach(t => { if (t.profiles) map.set(t.profiles.id, `${t.profiles.nombre} ${t.profiles.apellido}`); });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a,b) => a.label.localeCompare(b.label));
  }, [tasks]);

  const filteredTasks = tasks.filter(t => {
    if (selectedPdvs.length > 0 && (!t.pdv || !selectedPdvs.includes(t.pdv.id))) return false;
    if (selectedRoutines.length > 0 && (!t.routine_templates || !selectedRoutines.includes(t.routine_templates.id))) return false;
    if (selectedUsers.length > 0 && (!t.profiles || !selectedUsers.includes(t.profiles.id))) return false;
    if (selectedExecutionStatus.length > 0 && !selectedExecutionStatus.includes(t.estado)) return false;
    if (selectedAuditStatus.length > 0) {
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
    setSelectedPdvs([]); setSelectedRoutines([]); setSelectedUsers([]);
    setSelectedExecutionStatus([]); setSelectedAuditStatus(["pendiente"]);
    setDateFrom(""); setDateTo("");
  };

  const hasActiveFilters = 
    selectedPdvs.length > 0 || selectedRoutines.length > 0 || selectedUsers.length > 0 || 
    selectedExecutionStatus.length > 0 || 
    (selectedAuditStatus.length > 0 && (selectedAuditStatus.length !== 1 || !selectedAuditStatus.includes('pendiente'))) ||
    dateFrom || dateTo;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Auditoría de Calidad</h2>
        <p className="text-muted-foreground">Revisión y aprobación de tareas ejecutadas en campo.</p>
      </div>

      {/* --- PANEL DE FILTROS --- */}
      <Card className="bg-muted/20 border-primary/10 overflow-hidden">
        {/* En móvil usamos Accordion para ahorrar espacio */}
        <div className="md:hidden">
          <Accordion type="single" collapsible>
            <AccordionItem value="filters" className="border-none">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Filter className="w-4 h-4" /> Filtros Avanzados
                  {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-primary" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Desde</Label>
                    <div className="relative">
                      <CalendarIcon 
                        className="absolute left-2 top-2 h-4 w-4 text-muted-foreground cursor-pointer z-10" 
                        onClick={() => openDatePicker('date-from-audit-m')} 
                      />
                      <Input 
                        id="date-from-audit-m"
                        type="date" 
                        className="h-9 pl-8" 
                        value={dateFrom} 
                        onChange={(e) => setDateFrom(e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hasta</Label>
                    <div className="relative">
                      <CalendarIcon 
                        className="absolute left-2 top-2 h-4 w-4 text-muted-foreground cursor-pointer z-10" 
                        onClick={() => openDatePicker('date-to-audit-m')} 
                      />
                      <Input 
                        id="date-to-audit-m"
                        type="date" 
                        className="h-9 pl-8" 
                        value={dateTo} 
                        onChange={(e) => setDateTo(e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Estado Auditoría</Label>
                    <MultiSelect options={auditStatusOptions} selected={selectedAuditStatus} onChange={setSelectedAuditStatus} placeholder="Estado..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Puntos de Venta</Label>
                    <MultiSelect options={pdvOptions} selected={selectedPdvs} onChange={setSelectedPdvs} placeholder="Todos los PDV" />
                  </div>
                  {/* Otros filtros ocultos en móvil para simplificar, o agregados si son críticos */}
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full mt-2 text-destructive">
                      Limpiar Filtros
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* En desktop mostramos todo expandido */}
        <CardContent className="hidden md:block px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Filter className="w-4 h-4" /> Filtros Avanzados
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-7 text-destructive hover:bg-destructive/10">
                <X className="w-3 h-3 mr-1" /> Limpiar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <div className="relative">
                <CalendarIcon 
                  className="absolute left-2 top-2 h-4 w-4 text-muted-foreground cursor-pointer z-10 hover:text-primary" 
                  onClick={() => openDatePicker('date-from-audit')} 
                />
                <Input 
                  id="date-from-audit"
                  type="date" 
                  className="h-8 pl-8 text-xs bg-background" 
                  value={dateFrom} 
                  onChange={(e) => setDateFrom(e.target.value)} 
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <div className="relative">
                <CalendarIcon 
                  className="absolute left-2 top-2 h-4 w-4 text-muted-foreground cursor-pointer z-10 hover:text-primary" 
                  onClick={() => openDatePicker('date-to-audit')} 
                />
                <Input 
                  id="date-to-audit"
                  type="date" 
                  className="h-8 pl-8 text-xs bg-background" 
                  value={dateTo} 
                  onChange={(e) => setDateTo(e.target.value)} 
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estado Auditoría</Label>
              <MultiSelect options={auditStatusOptions} selected={selectedAuditStatus} onChange={setSelectedAuditStatus} placeholder="Estado..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Puntos de Venta</Label>
              <MultiSelect options={pdvOptions} selected={selectedPdvs} onChange={setSelectedPdvs} placeholder="Todos los PDV" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rutinas</Label>
              <MultiSelect options={routineOptions} selected={selectedRoutines} onChange={setSelectedRoutines} placeholder="Todas las Rutinas" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ejecución</Label>
              <MultiSelect options={executionStatusOptions} selected={selectedExecutionStatus} onChange={setSelectedExecutionStatus} placeholder="A tiempo / Vencida" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- VISTA MÓVIL: TARJETAS --- */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {filteredTasks.map((task) => {
          const r = task.routine_templates || {};
          const deadline = calculateTaskDeadline(task);
          
          return (
            <Card key={task.id} className="p-4 shadow-sm border-l-4" style={{ borderLeftColor: task.audit_status === 'rechazado' ? '#EF4444' : task.audit_status === 'aprobado' ? '#22C55E' : '#94A3B8' }}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-bold text-sm line-clamp-1">{r.nombre}</h4>
                  <p className="text-xs text-muted-foreground">{task.pdv?.nombre}</p>
                </div>
                {(!task.audit_status || task.audit_status === 'pendiente') ? (
                  <Badge variant="outline" className="text-[10px]">Pendiente</Badge>
                ) : (
                  <Badge className={task.audit_status === 'aprobado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                    {task.audit_status}
                  </Badge>
                )}
              </div>

              <div className="space-y-1.5 mb-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="w-3 h-3" />
                  <span>{task.profiles ? `${task.profiles.nombre} ${task.profiles.apellido}` : 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span className="capitalize">Ejecutado: {task.completado_at ? format(new Date(task.completado_at), "dd MMM HH:mm", { locale: es }) : '-'}</span>
                </div>
              </div>

              <Button className="w-full h-8 text-xs" variant="outline" onClick={() => handleReview(task)}>
                <Eye className="w-3 h-3 mr-2" /> Revisar Detalles
              </Button>
            </Card>
          );
        })}
        {filteredTasks.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground text-sm">No se encontraron tareas.</div>
        )}
      </div>

      {/* --- VISTA DESKTOP: TABLA --- */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Fecha Límite</TableHead>
                  <TableHead className="whitespace-nowrap">Ejecutada</TableHead>
                  <TableHead className="min-w-[200px]">Rutina / Requisitos</TableHead>
                  <TableHead className="min-w-[150px]">PDV</TableHead>
                  <TableHead>Ejecución</TableHead>
                  <TableHead>Auditoría</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
                ) : filteredTasks.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No se encontraron tareas.</TableCell></TableRow>
                ) : (
                  filteredTasks.map((task) => {
                    const r = task.routine_templates || {};
                    const deadline = calculateTaskDeadline(task);
                    return (
                      <TableRow key={task.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium text-muted-foreground capitalize">{format(deadline, "dd MMM", { locale: es })}</span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{format(deadline, "HH:mm")}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium capitalize">{task.completado_at ? format(new Date(task.completado_at), "dd MMM", { locale: es }) : '-'}</span>
                            <span className="text-muted-foreground">{task.completado_at ? format(new Date(task.completado_at), "HH:mm") : '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="font-medium flex items-center gap-2">{r.nombre}{r.prioridad === 'critica' && <Badge variant="destructive" className="text-[9px] h-4 px-1">Crítica</Badge>}</div>
                            <div className="flex gap-1 text-muted-foreground">
                              {r.gps_obligatorio && <MapPin className="w-3 h-3 text-blue-500" />}
                              {r.fotos_obligatorias && <Camera className="w-3 h-3 text-purple-500" />}
                              {r.requiere_inventario && <Box className="w-3 h-3 text-orange-500" />}
                              {r.archivo_obligatorio && <FileText className="w-3 h-3 text-cyan-500" />}
                              {(r.enviar_email || r.responder_email) && <Mail className="w-3 h-3 text-pink-500" />}
                              {r.comentario_obligatorio && <MessageSquareText className="w-3 h-3 text-yellow-500" />}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-sm">
                            <span className="truncate max-w-[150px]">{task.pdv?.nombre}</span>
                            <span className="text-xs text-muted-foreground">{task.profiles ? `${task.profiles.nombre} ${task.profiles.apellido}` : 'Desconocido'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {task.estado === 'completada_a_tiempo' && <Badge className="bg-green-100 text-green-800 border-green-200 whitespace-nowrap">A Tiempo</Badge>}
                          {task.estado === 'completada_vencida' && <Badge className="bg-red-100 text-red-800 border-red-200 whitespace-nowrap">Vencida</Badge>}
                          {task.estado === 'completada' && <Badge variant="outline">Completada</Badge>}
                        </TableCell>
                        <TableCell>
                          {task.audit_status === 'aprobado' && <Badge className="bg-blue-100 text-blue-800 border-blue-200">Aprobado</Badge>}
                          {task.audit_status === 'rechazado' && <Badge className="bg-red-100 text-red-800 border-red-200">Rechazado</Badge>}
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