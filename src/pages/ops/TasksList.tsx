import { useMyTasks } from "@/hooks/useMyTasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, Clock, Calendar } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function TasksList() {
  const { data: tasks, isLoading, error } = useMyTasks();

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          No se pudieron cargar las tareas: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No tienes tareas asignadas por el momento.
      </div>
    );
  }

  // Filter based on 'estado' column
  const pendingTasks = tasks.filter((t) => t.estado === "pendiente" || t.estado === "en_proceso");
  const completedTasks = tasks.filter((t) => t.estado?.startsWith("completada") || t.estado === "incumplida");

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Mis Tareas</h2>
        <p className="text-muted-foreground">
          Gestión diaria de actividades asignadas.
        </p>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">Pendientes ({pendingTasks.length})</TabsTrigger>
          <TabsTrigger value="all">Todas ({tasks.length})</TabsTrigger>
          <TabsTrigger value="completed">Realizadas ({completedTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4 mt-4">
          <TaskGrid tasks={pendingTasks} emptyMsg="¡Todo al día! No hay tareas pendientes." />
        </TabsContent>

        <TabsContent value="all" className="space-y-4 mt-4">
          <TaskGrid tasks={tasks} />
        </TabsContent>
        
        <TabsContent value="completed" className="space-y-4 mt-4">
          <TaskGrid tasks={completedTasks} emptyMsg="Aún no has completado tareas." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TaskGrid({ tasks, emptyMsg = "No hay tareas." }: { tasks: any[], emptyMsg?: string }) {
  if (tasks.length === 0) {
    return <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">{emptyMsg}</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tasks.map((task) => (
        <Card key={task.id} className="hover:shadow-md transition-shadow cursor-pointer">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <Badge variant={task.estado?.includes('completada') ? "secondary" : "default"} className="capitalize">
                {task.estado?.replace(/_/g, ' ')}
              </Badge>
              {task.completado_at && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
            </div>
            <CardTitle className="text-lg mt-2 line-clamp-2">
              {task.rutina?.nombre || "Tarea sin nombre"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {task.fecha_programada ? format(new Date(task.fecha_programada), "PPP", { locale: es }) : 'Sin fecha'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>PDV: {task.pdv?.nombre || "N/A"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}