import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, MapPin, CheckCircle2, AlertCircle, Calendar, ArrowRight } from "lucide-react";
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

  const fetchTasks = async () => {
    setLoading(true);
    // Traer tareas del usuario (filtradas por RLS)
    // Para V1 traemos todas las pendientes de hoy o pasadas
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('task_instances')
      .select(`
        *,
        routine_templates (
          nombre,
          descripcion,
          prioridad,
          gps_obligatorio,
          fotos_obligatorias
        ),
        pdv (
          nombre,
          ciudad,
          latitud,
          longitud,
          radio_gps
        )
      `)
      .order('fecha_programada', { ascending: false })
      .order('prioridad_snapshot', { ascending: false }); // Alta prioridad primero

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

  // Agrupar tareas
  const pendingTasks = tasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso');
  const completedTasks = tasks.filter(t => t.estado === 'completada');

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'alta': return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'critica': return 'text-red-600 bg-red-100 border-red-200';
      default: return 'text-blue-600 bg-blue-100 border-blue-200';
    }
  };

  return (
    <div className="space-y-6 pb-20"> {/* pb-20 para espacio en móvil si hay navbar flotante */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Mis Tareas</h2>
        <p className="text-muted-foreground">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
        </p>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="pending">Pendientes ({pendingTasks.length})</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {loading ? (
            <div className="text-center py-10">Cargando tareas...</div>
          ) : pendingTasks.length === 0 ? (
            <div className="text-center py-10 flex flex-col items-center text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mb-2 text-green-500/50" />
              <p>¡Todo al día! No tienes tareas pendientes.</p>
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
                    {task.routine_templates?.gps_obligatorio && (
                      <MapPin className="w-4 h-4 text-muted-foreground" title="Requiere GPS" />
                    )}
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
            <div className="text-center py-10 text-muted-foreground">No hay tareas completadas recientes.</div>
          ) : (
             completedTasks.map((task) => (
              <Card key={task.id} className="bg-muted/40">
                <CardHeader className="pb-2">
                   <div className="flex justify-between items-center">
                    <CardTitle className="text-base text-muted-foreground line-through decoration-slate-400">
                      {task.routine_templates?.nombre}
                    </CardTitle>
                    <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                      Completada
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                   <p className="text-xs text-muted-foreground">
                    Finalizada el {format(new Date(task.completado_at), "dd/MM/yyyy HH:mm")}
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