import { useState, useMemo } from "react";
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
  User, Filter, Loader2, RefreshCw, AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { TaskExecutionModal } from "./TaskExecutionModal";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMyTasks } from "@/hooks/useMyTasks";
import { getLocalDate } from "@/lib/utils";
import { calculateTaskDeadline } from "./logic/task-deadline";

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

const getStatusBadge = (task: any) => {
  const now = new Date();
  const deadline = calculateTaskDeadline(task);
  const isLate = task.estado === 'pendiente' && now > deadline;
  
  if (task.estado === 'completada_a_tiempo') return <Badge className="bg-green-100 text-green-700 border-green-200">A Tiempo</Badge>;
  if (task.estado === 'completada_vencida') return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Vencida</Badge>;
  if (task.estado === 'incumplida') return <Badge className="bg-red-100 text-red-700 border-red-200">Incumplida</Badge>;
  
  if (isLate) return <Badge className="bg-red-50 text-red-600 border-red-100 animate-pulse">¡Vencida!</Badge>;
  
  return <Badge variant="outline" className="bg-white">Pendiente</Badge>;
};

const TaskCard = ({ task, onAction }: { task: any, onAction: (t: any) => void }) => {
  const r = task.routine_templates || {};
  const styles = getPriorityStyles(task.prioridad_snapshot);
  const isDone = task.estado.startsWith('completada') || task.estado === 'incumplida';
  
  // Calcular deadline para mostrarlo
  const deadline = calculateTaskDeadline(task);
  const deadlineStr = format(deadline, "d MMM HH:mm", { locale: es });

  return (
    <Card className={`flex flex-col h-full hover:shadow-lg transition-all duration-200 border-l-4 ${styles.border}`}>
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
          <div className="flex items-center gap-1.5 text-xs font-medium" title="Fecha límite de ejecución">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span>{deadlineStr}</span>
          </div>
          {getStatusBadge(task)}
        </div>

        <div className="flex gap-2 text-muted-foreground justify-center py-1.5 border-t border-b border-dashed border-gray-100">
          {r.gps_obligatorio && <span title="GPS"><MapPin className="w-3 h-3 text-blue-500" /></span>}
          {r.fotos_obligatorias && <span title="Fotos"><Camera className="w-3 h-3 text-purple-500" /></span>}
          {r.requiere_inventario && <span title="Inventario"><Box className="w-3 h-3 text-orange-500" /></span>}
          {r.comentario_obligatorio && <span title="Notas"><MessageSquareText className="w-3 h-3 text-yellow-500" /></span>}
          {r.archivo_obligatorio && <span title="Archivo"><FileText className="w-3 h-3 text-cyan-500" /></span>}
          {(r.enviar_email || r.responder_email) && <span title="Email"><Mail className="w-3 h-3 text-pink-500" /></span>}
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
          variant={isDone ? "secondary" : "default"}
          size="sm"
          onClick={() => onAction(task)}
        >
          {isDone ? (
            <><Eye className="w-3 h-3 mr-1.5" /> Ver Detalle</>
          ) : (
            <><ArrowRight className="w-3 h-3 ml-1.5" /> Ejecutar</>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

const TaskGrid = ({ items, loading, onRetry, emptyMessage, onAction }: { items: any[], loading: boolean, onRetry: () => void, emptyMessage: string, onAction: (t: any) => void }) => {
  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-muted/20 rounded-lg border-2 border-dashed">
        <CheckCircle2 className="w-12 h-12 mb-3 text-muted-foreground/50" />
        <h3 className="text-lg font-medium">Sin tareas</h3>
        <p className="text-muted-foreground text-sm mb-4">{emptyMessage}</p>
        <Button variant="link" onClick={onRetry} className="mt-2">
          <RefreshCw className="w-4 h-4 mr-2" /> Recargar Datos
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {items.map((task) => (
        <TaskCard key={task.id} task={task} onAction={onAction} />
      ))}
    </div>
  );
};

export default function TasksList() {
  const { profile } = useCurrentUser();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isExecutionOpen, setIsExecutionOpen] = useState(false);

  const todayStr = getLocalDate();
  
  const [dateFrom, setDateFrom] = useState<string>(todayStr);
  const [dateTo, setDateTo] = useState<string>(todayStr);
  
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Hook handles fetching logic
  const { data: tasks = [], isLoading, error, refetch } = useMyTasks(dateFrom, dateTo);

  const handleStartTask = (task: any) => {
    setSelectedTask(task);
    setIsExecutionOpen(true);
  };

  // --- FILTROS Y OPCIONES ---
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

  const filteredTasks = tasks.filter(t => {
    if (selectedPdvs.length > 0 && (!t.pdv || !selectedPdvs.includes(t.pdv.id))) return false;
    if (selectedRoutines.length > 0 && (!t.routine_templates || !selectedRoutines.includes(t.routine_templates.id))) return false;
    if (selectedUsers.length > 0 && (!t.profiles || !selectedUsers.includes(t.profiles.id))) return false;
    return true;
  });

  // --- LOGICA DE TABS ---
  const allTasks = filteredTasks;
  const pendingTasks = filteredTasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso');
  const completedTasks = filteredTasks.filter(t => t.estado.startsWith('completada') || t.estado === 'incumplida');

  const totalFiltered = filteredTasks.length;
  const totalDone = completedTasks.length;
  const progressPercentage = totalFiltered > 0 ? Math.round((totalDone / totalFiltered) * 100) : 0;

  const clearFilters = () => {
    const today = getLocalDate();
    setDateFrom(today);
    setDateTo(today);
    setSelectedPdvs([]);
    setSelectedRoutines([]);
    setSelectedUsers([]);
  };

  const hasActiveFilters = selectedPdvs.length > 0 || selectedRoutines.length > 0 || selectedUsers.length > 0;

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

      {/* --- FILTROS --- */}
      <Card className="bg-muted/20 border-primary/10">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Filter className="w-4 h-4" /> Filtros de Búsqueda
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()} title="Recargar Tareas">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                <Input type="date" className="h-8 pl-7 text-xs bg-background" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                <Input type="date" className="h-8 pl-7 text-xs bg-background" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Puntos de Venta</Label>
              <MultiSelect options={pdvOptions} selected={selectedPdvs} onChange={setSelectedPdvs} placeholder="Todos" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Rutinas</Label>
              <MultiSelect options={routineOptions} selected={selectedRoutines} onChange={setSelectedRoutines} placeholder="Todas" />
            </div>

            {profile?.role !== 'administrador' && (
              <div className="space-y-1">
                <Label className="text-xs">Usuarios</Label>
                <MultiSelect options={userOptions} selected={selectedUsers} onChange={setSelectedUsers} placeholder="Todos" />
              </div>
            )}
          </div>
          {hasActiveFilters && (
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-7 text-destructive hover:bg-destructive/10">
                <X className="w-3 h-3 mr-1" /> Restablecer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- PROGRESO --- */}
      <div className="bg-card border rounded-lg p-3 shadow-sm">
        <div className="flex justify-between text-xs font-medium mb-1">
          <span>Progreso ({dateFrom === dateTo ? format(new Date(dateFrom + 'T00:00:00'), 'dd/MM') : 'Periodo'})</span>
          <span className={progressPercentage < 100 ? "text-primary" : "text-green-600"}>{progressPercentage}%</span>
        </div>
        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 ${progressPercentage < 50 ? 'bg-orange-500' : 'bg-green-500'}`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Manejo de Errores */}
      {error && (
        <div className="p-4 rounded border border-red-200 bg-red-50 text-red-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>Error cargando tareas. Por favor intenta recargar.</span>
        </div>
      )}

      {/* Pestañas */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="all">Todas ({allTasks.length})</TabsTrigger>
          <TabsTrigger value="pending">Pendientes ({pendingTasks.length})</TabsTrigger>
          <TabsTrigger value="completed">Realizadas ({completedTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-0">
          <TaskGrid 
            items={allTasks} 
            loading={isLoading} 
            onRetry={refetch} 
            emptyMessage="No hay tareas para este rango de fechas." 
            onAction={handleStartTask} 
          />
        </TabsContent>

        <TabsContent value="pending" className="mt-0">
          <TaskGrid 
            items={pendingTasks} 
            loading={isLoading} 
            onRetry={refetch} 
            emptyMessage="¡Todo al día! No tienes tareas pendientes en estas fechas." 
            onAction={handleStartTask} 
          />
        </TabsContent>

        <TabsContent value="completed" className="mt-0">
          <TaskGrid 
            items={completedTasks} 
            loading={isLoading} 
            onRetry={refetch} 
            emptyMessage="No hay tareas completadas en estas fechas." 
            onAction={handleStartTask} 
          />
        </TabsContent>
      </Tabs>

      <TaskExecutionModal 
        task={selectedTask}
        open={isExecutionOpen}
        onOpenChange={setIsExecutionOpen}
        onSuccess={() => refetch()}
      />
    </div>
  );
}