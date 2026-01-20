import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Clock, MapPin, CheckCircle2, ArrowRight, Filter, X, Calendar as CalendarIcon } from "lucide-react";
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
    // Traer tareas (filtradas por RLS en backend automáticamente)
    const { data, error } = await supabase
      .from('task_instances')
      .select(`
        *,
        routine_templates (
          id,
          nombre,
          descripcion,
          prioridad,
          gps_obligatorio,
          fotos_obligatorias
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

  // 1. Obtener listas únicas para los selects
  const uniquePdvs = useMemo(() => {
    const pdvMap = new Map();
    tasks.forEach(t => {
      if (t.pdv) pdvMap.set(t.pdv.id, t.pdv.nombre);
    });
    return Array.from(pdvMap.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [tasks]);

  const uniqueRoutines = useMemo(() => {
    const routineMap = new Map();
    tasks.forEach(t => {
      if (t.routine_templates) routineMap.set(t.routine_templates.id, t.routine_templates.nombre);
    });
    return Array.from(routineMap.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [tasks]);

  // 2. Aplicar filtros
  const filteredTasks = tasks.filter(t => {
    const matchesDate = filterDate ? t.fecha_programada === filterDate : true;
    const matchesPdv = filterPdv !== "all" ? t.pdv?.id === filterPdv : true;
    const matchesRoutine = filterRoutine !== "all" ? t.routine_templates?.id === filterRoutine : true;
    return matchesDate && matchesPdv && matchesRoutine;
  });

  // 3. Separar en pendientes y completadas (usando la lista FILTRADA)
  const pendingTasks = filteredTasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso');
  const completedTasks = filteredTasks.filter(t => t.estado === 'completada' || t.estado === 'completada_vencida');

  // --- LÓGICA DE BARRA DE PROGRESO ---
  const totalFiltered = filteredTasks.length;
  const totalCompleted = completedTasks.length;
  const progressPercentage = totalFiltered > 0 ? Math.round((totalCompleted / totalFiltered) * 100) : 0;

  // Colores dinámicos
  const getProgressColor = (percent: number) => {
    if (percent < 45) return "bg-red-500";
    if (percent < 90) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'alta': return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'critica': return 'text-red-600 bg-red-100 border-red-200';
      default: return 'text-blue-600 bg-blue-100 border-blue-200';
    }
  };

  const clearFilters = () => {
    setFilterDate("");
    setFilterPdv("all");
    setFilterRoutine("all");
  };

  const hasActiveFilters = filterDate || filterPdv !== "all" || filterRoutine !== "all";

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

      {/* SECCIÓN DE FILTROS Y PROGRESO */}
      <div className="bg-card border rounded-lg p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Filtro Fecha */}
          <div className="flex-1 min-w-[150px]">
            <div className="relative">
              <CalendarIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                type="date" 
                className="pl-8" 
                value={filterDate} 
                onChange={(e) => setFilterDate(e.target.value)} 
              />
            </div>
          </div>

          {/* Filtro PDV */}
          <div className="flex-1 min-w-[200px]">
            <Select value={filterPdv} onValueChange={setFilterPdv}>
              <SelectTrigger>
                <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Todos los PDV" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los PDV</SelectItem>
                {uniquePdvs.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Rutina */}
          <div className="flex-1 min-w-[200px]">
            <Select value={filterRoutine} onValueChange={setFilterRoutine}>
              <SelectTrigger>
                <CheckCircle2 className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Todas las Rutinas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las Rutinas</SelectItem>
                {uniqueRoutines.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Botón Limpiar */}
          {hasActiveFilters && (
            <Button variant="ghost" size="icon" onClick={clearFilters} title="Limpiar filtros">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* BARRA DE PROGRESO */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm font-medium">
            <span>Progreso del listado</span>
            <span className={
              progressPercentage < 45 ? "text-red-600" : 
              progressPercentage < 90 ? "text-yellow-600" : "text-green-600"
            }>
              {progressPercentage}% ({totalCompleted}/{totalFiltered})
            </span>
          </div>
          {/* Custom Progress Bar para controlar el color dinámico */}
          <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ease-in-out ${getProgressColor(progressPercentage)}`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="pending">Pendientes ({pendingTasks.length})</TabsTrigger>
          <TabsTrigger value="history">Historial ({completedTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {loading ? (
            <div className="text-center py-10">Cargando tareas...</div>
          ) : pendingTasks.length === 0 ? (
            <div className="text-center py-10 flex flex-col items-center text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mb-2 text-green-500/50" />
              <p>
                {hasActiveFilters 
                  ? "No hay tareas pendientes con estos filtros." 
                  : "¡Todo al día! No tienes tareas pendientes."}
              </p>
            </div>
          ) : (
            pendingTasks.map((task) => (
              <Card key={task.id} className="border-l-4 border-l-primary hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <Badge variant="outline" className={`mb-2 capitalize ${getPriorityColor(task.prioridad_snapshot)}`}>
                        {task.prioridad_snapshot}
                      </Badge>
                      <CardTitle className="text-lg">{task.routine_templates?.nombre}</CardTitle>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className="font-normal text-xs">
                        {format(new Date(task.fecha_programada), "dd/MM")}
                      </Badge>
                      {task.routine_templates?.gps_obligatorio && (
                        <div title="Requiere GPS">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                  <CardDescription className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    Vence: {task.hora_limite_snapshot?.slice(0,5)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-2">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {task.pdv?.nombre} - {task.pdv?.ciudad}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" onClick={() => handleStartTask(task)}>
                    Iniciar Ejecución <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {completedTasks.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No hay tareas completadas con estos filtros.</div>
          ) : (
             completedTasks.map((task) => (
              <Card key={task.id} className="bg-muted/40">
                <CardHeader className="pb-2">
                   <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <CardTitle className="text-base text-muted-foreground line-through decoration-slate-400">
                        {task.routine_templates?.nombre}
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">{task.pdv?.nombre}</span>
                    </div>
                    <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                      Completada
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                   <p className="text-xs text-muted-foreground">
                    Finalizada el {task.completado_at ? format(new Date(task.completado_at), "dd/MM/yyyy HH:mm") : '-'}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
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