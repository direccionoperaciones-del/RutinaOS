import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Clock, MapPin, CheckCircle2, Filter, X, 
  Calendar as CalendarIcon, Eye, Camera, Mail, 
  MessageSquareText, Box, FileText,
  Repeat, CalendarDays, CalendarRange, ArrowRight
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

  // Estados de Filtros
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterPdv, setFilterPdv] = useState<string>("all");
  const [filterRoutine, setFilterRoutine] = useState<string>("all");

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

  // --- LÓGICA DE FILTROS ---
  const uniquePdvs = useMemo(() => {
    const pdvMap = new Map();
    tasks.forEach(t => { if (t.pdv) pdvMap.set(t.pdv.id, t.pdv.nombre); });
    return Array.from(pdvMap.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [tasks]);

  const uniqueRoutines = useMemo(() => {
    const routineMap = new Map();
    tasks.forEach(t => { if (t.routine_templates) routineMap.set(t.routine_templates.id, t.routine_templates.nombre); });
    return Array.from(routineMap.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [tasks]);

  const filteredTasks = tasks.filter(t => {
    const matchesDate = filterDate ? t.fecha_programada === filterDate : true;
    const matchesPdv = filterPdv !== "all" ? t.pdv?.id === filterPdv : true;
    const matchesRoutine = filterRoutine !== "all" ? t.routine_templates?.id === filterRoutine : true;
    return matchesDate && matchesPdv && matchesRoutine;
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
    t.estado === 'completada' || 
    t.estado === 'completada_vencida' || 
    t.estado === 'incumplida'
  );

  const totalFiltered = filteredTasks.length;
  const totalCompleted = filteredTasks.filter(t => t.estado.startsWith('completada')).length;
  const progressPercentage = totalFiltered > 0 ? Math.round((totalCompleted / totalFiltered) * 100) : 0;

  const clearFilters = () => {
    setFilterDate("");
    setFilterPdv("all");
    setFilterRoutine("all");
  };

  const hasActiveFilters = filterDate || filterPdv !== "all" || filterRoutine !== "all";

  // --- HELPERS VISUALES ---

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'critica': return { 
        badge: 'bg-red-600 text-white border-red-700 hover:bg-red-700', 
        border: 'border-l-4 border-l-red-600' 
      };
      case 'alta': return { 
        badge: 'bg-orange-500 text-white border-orange-600 hover:bg-orange-600', 
        border: 'border-l-4 border-l-orange-500' 
      };
      case 'media': return { 
        badge: 'bg-yellow-500 text-white border-yellow-600 hover:bg-yellow-600', 
        border: 'border-l-4 border-l-yellow-500' 
      };
      default: return { 
        badge: 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700', 
        border: 'border-l-4 border-l-emerald-600' 
      };
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
      case 'completada_vencida': return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case 'incumplida': return "bg-red-100 text-red-700 border-red-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  // Componente de Tarjeta de Tarea
  const TaskCard = ({ task }: { task: any }) => {
    const r = task.routine_templates || {};
    const styles = getPriorityStyles(task.prioridad_snapshot);
    const isCompleted = task.estado === 'completada' || task.estado === 'completada_vencida';
    const isLate = task.estado === 'pendiente' && new Date() > new Date(`${task.fecha_programada}T${task.hora_limite_snapshot}`);

    return (
      <Card className={`flex flex-col h-full hover:shadow-lg transition-shadow duration-200 ${styles.border}`}>
        <CardHeader className="p-4 pb-2 space-y-2">
          <div className="flex justify-between items-start">
            <Badge className={`uppercase text-[10px] font-bold px-2 py-0.5 rounded-sm ${styles.badge}`}>
              {task.prioridad_snapshot}
            </Badge>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase font-medium bg-muted px-2 py-0.5 rounded-full">
              {getFrequencyIcon(r.frecuencia)}
              {r.frecuencia}
            </div>
          </div>
          
          <div>
            <h3 className="font-bold text-lg leading-tight line-clamp-2" title={r.nombre}>
              {r.nombre}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{task.pdv?.nombre}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-2 flex-1">
          {/* Info de Tiempos y Estado */}
          <div className="flex justify-between items-center bg-muted/30 p-2 rounded-md mb-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Vence: {task.hora_limite_snapshot?.slice(0,5)}</span>
            </div>
            {isCompleted ? (
              <Badge variant="outline" className={getStatusColor(task.estado)}>
                {task.estado === 'completada' ? 'A Tiempo' : 'Vencida'}
              </Badge>
            ) : task.estado === 'incumplida' ? (
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">Incumplida</Badge>
            ) : isLate ? (
              <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">Retrasada</Badge>
            ) : (
              <Badge variant="outline" className="bg-white">Pendiente</Badge>
            )}
          </div>

          {/* Iconos de Requisitos */}
          <div className="flex gap-3 text-muted-foreground justify-center py-2 border-t border-b border-dashed border-gray-100">
            {r.gps_obligatorio && (
              <div className="flex flex-col items-center gap-0.5" title="Requiere GPS">
                <MapPin className="w-4 h-4 text-blue-500" />
                <span className="text-[9px]">GPS</span>
              </div>
            )}
            {r.fotos_obligatorias && (
              <div className="flex flex-col items-center gap-0.5" title={`Fotos: ${r.min_fotos}`}>
                <Camera className="w-4 h-4 text-purple-500" />
                <span className="text-[9px]">FOTO</span>
              </div>
            )}
            {r.comentario_obligatorio && (
              <div className="flex flex-col items-center gap-0.5" title="Comentario Obligatorio">
                <MessageSquareText className="w-4 h-4 text-orange-500" />
                <span className="text-[9px]">NOTA</span>
              </div>
            )}
            {r.requiere_inventario && (
              <div className="flex flex-col items-center gap-0.5" title="Inventario">
                <Box className="w-4 h-4 text-indigo-500" />
                <span className="text-[9px]">INV</span>
              </div>
            )}
            {r.archivo_obligatorio && (
              <div className="flex flex-col items-center gap-0.5" title="Archivo">
                <FileText className="w-4 h-4 text-cyan-500" />
                <span className="text-[9px]">DOC</span>
              </div>
            )}
            {r.enviar_email && (
              <div className="flex flex-col items-center gap-0.5" title="Enviar Email">
                <Mail className="w-4 h-4 text-pink-500" />
                <span className="text-[9px]">MAIL</span>
              </div>
            )}
            {r.responder_email && (
              <div className="flex flex-col items-center gap-0.5" title="Responder Email">
                <Mail className="w-4 h-4 text-teal-500" />
                <span className="text-[9px]">RESP</span>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="p-3 bg-muted/10">
          <Button 
            className="w-full shadow-sm hover:shadow transition-all" 
            variant={isCompleted || task.estado === 'incumplida' ? "secondary" : "default"}
            size="sm"
            onClick={() => handleStartTask(task)}
          >
            {(isCompleted || task.estado === 'incumplida') ? (
              <>
                <Eye className="w-4 h-4 mr-2" /> Ver Detalle
              </>
            ) : (
              <>
                Ver <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    );
  };

  const TaskGrid = ({ items, emptyMessage }: { items: any[], emptyMessage: string }) => {
    if (loading) {
      return <div className="text-center py-10">Cargando tareas...</div>;
    }
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

      {/* FILTROS Y PROGRESO */}
      <div className="bg-card border rounded-lg p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 min-w-[150px]">
            <div className="relative">
              <CalendarIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="date" className="pl-8" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Select value={filterPdv} onValueChange={setFilterPdv}>
              <SelectTrigger>
                <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Todos los PDV" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los PDV</SelectItem>
                {uniquePdvs.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Select value={filterRoutine} onValueChange={setFilterRoutine}>
              <SelectTrigger>
                <CheckCircle2 className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Todas las Rutinas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las Rutinas</SelectItem>
                {uniqueRoutines.map(r => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="icon" onClick={clearFilters} title="Limpiar filtros">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-sm font-medium">
            <span>Progreso diario</span>
            <span className={progressPercentage < 100 ? "text-primary" : "text-green-600"}>
              {progressPercentage}%
            </span>
          </div>
          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ease-in-out ${progressPercentage < 50 ? 'bg-orange-500' : 'bg-green-500'}`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

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