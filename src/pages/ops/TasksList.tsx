import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { 
  Clock, MapPin, CheckCircle2, X, 
  Calendar as CalendarIcon, Eye, Camera, Mail, 
  MessageSquareText, Box, FileText,
  Repeat, CalendarDays, CalendarRange, ArrowRight,
  User, Filter
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { TaskExecutionModal } from "./TaskExecutionModal";

export default function TasksList() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isExecutionOpen, setIsExecutionOpen] = useState(false);

  // --- ESTADOS DE FILTROS ---
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  
  // Arrays para selección múltiple
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const fetchTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('task_instances')
      .select(`
        *,
        routine_templates (
          id,
          nombre,
          descripcion,
          prioridad,
          frecuencia,
          gps_obligatorio,
          fotos_obligatorias,
          min_fotos,
          comentario_obligatorio,
          requiere_inventario,
          categorias_ids, 
          archivo_obligatorio,
          enviar_email,
          responder_email
        ),
        pdv (
          id,
          nombre,
          ciudad,
          latitud,
          longitud,
          radio_gps
        ),
        profiles:completado_por (
          id,
          nombre,
          apellido
        )
      `)
      .order('fecha_programada', { ascending: false })
      .order('prioridad_snapshot', { ascending: false });

    if (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las tareas." });
    } else {
      setTasks(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleStartTask = (task: any) => {
    setSelectedTask(task);
    setIsExecutionOpen(true);
  };

  // --- LÓGICA DE OPCIONES PARA FILTROS (Memoized) ---
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

  // --- FILTRADO DE DATOS ---
  const filteredTasks = tasks.filter(t => {
    // Filtro Fecha (Rango)
    if (dateFrom && t.fecha_programada < dateFrom) return false;
    if (dateTo && t.fecha_programada > dateTo) return false;

    // Filtro PDV (Multi)
    if (selectedPdvs.length > 0 && (!t.pdv || !selectedPdvs.includes(t.pdv.id))) return false;

    // Filtro Rutina (Multi)
    if (selectedRoutines.length > 0 && (!t.routine_templates || !selectedRoutines.includes(t.routine_templates.id))) return false;

    // Filtro Usuario (Multi)
    if (selectedUsers.length > 0) {
      if (!t.completado_por || !selectedUsers.includes(t.completado_por)) return false;
    }

    return true;
  });

  // Categorización de Tareas
  const allTasks = filteredTasks;
  const pendingTasks = filteredTasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso');
  
  const overdueTasks = filteredTasks.filter(t => 
    t.estado === 'incumplida' || 
    t.estado === 'completada_vencida' || 
    (t.estado === 'pendiente' && new Date() > new Date(`${t.fecha_programada}T${t.hora_limite_snapshot}`))
  );
  
  const historyTasks = filteredTasks.filter(t => 
    t.estado.startsWith('completada') || t.estado === 'incumplida'
  );

  const totalFiltered = filteredTasks.length;
  const totalCompleted = filteredTasks.filter(t => t.estado.startsWith('completada')).length;
  const progressPercentage = totalFiltered > 0 ? Math.round((totalCompleted / totalFiltered) * 100) : 0;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedPdvs([]);
    setSelectedRoutines([]);
    setSelectedUsers([]);
  };

  const hasActiveFilters = dateFrom || dateTo || selectedPdvs.length > 0 || selectedRoutines.length > 0 || selectedUsers.length > 0;

  // --- HELPERS VISUALES ---
  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'critica': return { badge: 'bg-red-600 text-white border-red-700', border: 'border-l-4 border-l-red-600' };
      case 'alta': return { badge: 'bg-orange-500 text-white border-orange-600', border: 'border-l-4 border-l-orange-500' };
      case 'media': return { badge: 'bg-yellow-500 text-white border-yellow-600', border: 'border-l-4 border-l-yellow-500' };
      default: return { badge: 'bg-emerald-600 text-white border-emerald-700', border: 'border-l-4 border-l-emerald-600' };
    }
  };

  const getFrequencyIcon = (freq: string) => {
    switch (freq) {
      case 'diaria': return <Repeat className="w-3 h-3" />;
      case 'semanal': return <CalendarDays className="w-3 h-3" />;
      default: return <CalendarRange className="w-3 h-3" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completada': return "bg-green-100 text-green-700 border-green-200";
      case 'completada_a_tiempo': return "bg-green-100 text-green-700 border-green-200";
      case 'completada_vencida': return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case 'incumplida': return "bg-red-100 text-red-700 border-red-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completada': return "Completada";
      case 'completada_a_tiempo': return "A Tiempo";
      case 'completada_vencida': return "Vencida";
      case 'incumplida': return "Incumplida";
      default: return "Pendiente";
    }
  };

  const TaskCard = ({ task }: { task: any }) => {
    const r = task.routine_templates || {};
    const styles = getPriorityStyles(task.prioridad_snapshot);
    const isCompleted = task.estado.startsWith('completada');
    const isLate = task.estado === 'pendiente' && new Date() > new Date(`${task.fecha_programada}T${task.hora_limite_snapshot}`);

    return (
      <Card className={`flex flex-col h-full hover:shadow-lg transition-shadow duration-200 ${styles.border}`}>
        <CardHeader className="p-3 pb-1 space-y-1"> 
          <div className="flex justify-between items-start">
            <Badge className={`uppercase text-[9px] font-bold px-1.5 py-0 rounded-sm ${styles.badge}`}>
              {task.prioridad_snapshot}
            </Badge>
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase font-medium bg-muted px-1.5 py-0 rounded-full">
              {getFrequencyIcon(r.frecuencia)}
              {r.frecuencia}
            </div>
          </div>
          
          <div>
            <h3 className="font-bold text-base leading-tight line-clamp-2" title={r.nombre}>
              {r.nombre}
            </h3>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{task.pdv?.nombre}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 pt-2 flex-1">
          <div className="flex justify-between items-center bg-muted/30 p-1.5 rounded-md mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span>{task.fecha_programada} | {task.hora_limite_snapshot?.slice(0,5)}</span>
            </div>
            {isCompleted ? (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(task.estado)}`}>
                {getStatusLabel(task.estado)}
              </Badge>
            ) : task.estado === 'incumplida' ? (
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">Incumplida</Badge>
            ) : isLate ? (
              <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] px-1.5 py-0">Retrasada</Badge>
            ) : (
              <Badge variant="outline" className="bg-white text-[10px] px-1.5 py-0">Pendiente</Badge>
            )}
          </div>

          <div className="flex gap-2 text-muted-foreground justify-center py-1.5 border-t border-b border-dashed border-gray-100">
            {r.gps_obligatorio && <MapPin className="w-3 h-3 text-blue-500" />}
            {r.fotos_obligatorias && <Camera className="w-3 h-3 text-purple-500" />}
            {r.comentario_obligatorio && <MessageSquareText className="w-3 h-3 text-orange-500" />}
            {r.requiere_inventario && <Box className="w-3 h-3 text-indigo-500" />}
            {r.archivo_obligatorio && <FileText className="w-3 h-3 text-cyan-500" />}
            {(r.enviar_email || r.responder_email) && <Mail className="w-3 h-3 text-pink-500" />}
          </div>

          {task.profiles && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1 bg-muted/20 p-1 rounded">
              <User className="w-3 h-3" />
              <span className="truncate">{task.profiles.nombre} {task.profiles.apellido}</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="p-2 bg-muted/10">
          <Button 
            className="w-full h-8 text-xs shadow-sm hover:shadow transition-all" 
            variant={isCompleted || task.estado === 'incumplida' ? "secondary" : "default"}
            size="sm"
            onClick={() => handleStartTask(task)}
          >
            {(isCompleted || task.estado === 'incumplida') ? (
              <>
                <Eye className="w-3 h-3 mr-1.5" /> Ver Detalle
              </>
            ) : (
              <>
                Ver <ArrowRight className="w-3 h-3 ml-1.5" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    );
  };

  const TaskGrid = ({ items, emptyMessage }: { items: any[], emptyMessage: string }) => {
    if (loading) return <div className="text-center py-10">Cargando tareas...</div>;
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 bg-muted/20 rounded-lg border-2 border-dashed">
          <CheckCircle2 className="w-12 h-12 mb-3 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">Sin tareas</h3>
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {items.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Mis Tareas</h2>
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
          </p>
        </div>
      </div>

      {/* --- PANEL DE FILTROS AVANZADOS --- */}
      <Card className="bg-muted/20 border-primary/10">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Filter className="w-4 h-4" /> Filtros de Búsqueda
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            
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

            {/* Selectores Múltiples */}
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
              <Label className="text-xs">Usuarios</Label>
              <MultiSelect 
                options={userOptions} 
                selected={selectedUsers} 
                onChange={setSelectedUsers} 
                placeholder="Todos los Usuarios"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-3 flex justify-end">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFilters} 
                className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <X className="w-3 h-3 mr-1" /> Limpiar Filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- BARRA DE PROGRESO --- */}
      <div className="bg-card border rounded-lg p-3 shadow-sm">
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-medium">
            <span>Progreso de tareas (según filtros)</span>
            <span className={progressPercentage < 100 ? "text-primary" : "text-green-600"}>
              {progressPercentage}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ease-in-out ${progressPercentage < 50 ? 'bg-orange-500' : 'bg-green-500'}`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* --- TABS --- */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="all">Todas ({allTasks.length})</TabsTrigger>
          <TabsTrigger value="pending">Pendientes ({pendingTasks.length})</TabsTrigger>
          <TabsTrigger value="overdue">Vencidas ({overdueTasks.length})</TabsTrigger>
          <TabsTrigger value="history">Historial ({historyTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-6">
          <TaskGrid items={allTasks} emptyMessage="No hay tareas para mostrar." />
        </TabsContent>

        <TabsContent value="pending" className="space-y-6">
          <TaskGrid items={pendingTasks} emptyMessage="¡Todo al día! No hay tareas pendientes." />
        </TabsContent>

        <TabsContent value="overdue" className="space-y-6">
          <TaskGrid items={overdueTasks} emptyMessage="No tienes tareas vencidas ni incumplidas." />
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <TaskGrid items={historyTasks} emptyMessage="No hay historial disponible con estos filtros." />
        </TabsContent>
      </Tabs>

      <TaskExecutionModal 
        task={selectedTask}
        open={isExecutionOpen}
        onOpenChange={setIsExecutionOpen}
        onSuccess={fetchTasks}
      />
    </div>
  );
}