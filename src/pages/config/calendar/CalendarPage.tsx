import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, Calendar as CalendarIcon, MapPin, CheckCircle2, AlertCircle, Clock, XCircle } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function CalendarPage() {
  const { tenantId, profile } = useCurrentUser();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Estados para los marcadores visuales del calendario
  const [statusDates, setStatusDates] = useState<{
    completed: Date[];
    failed: Date[];
    pending: Date[];
  }>({ completed: [], failed: [], pending: [] });

  // Cargar estados de fechas para colorear el calendario (puntos de colores)
  useEffect(() => {
    if (!tenantId) return;
    
    const fetchCalendarStatus = async () => {
      let query = supabase
        .from('task_instances')
        .select('fecha_programada, estado, hora_limite_snapshot')
        .eq('tenant_id', tenantId)
        .limit(1000);

      const { data } = await query;
      
      if (data) {
        const tempStatus: Record<string, { hasFailure: boolean, hasPending: boolean, count: number }> = {};
        const now = new Date();

        data.forEach(t => {
          const d = t.fecha_programada;
          if (!tempStatus[d]) tempStatus[d] = { hasFailure: false, hasPending: false, count: 0 };
          
          tempStatus[d].count++;

          // Lógica de Vencimiento
          const deadline = new Date(`${t.fecha_programada}T${t.hora_limite_snapshot || '23:59:00'}`);
          const isOverdue = t.estado === 'pendiente' && now > deadline;

          if (t.estado === 'incumplida' || t.estado === 'completada_vencida' || isOverdue) {
            tempStatus[d].hasFailure = true;
          } else if (t.estado === 'pendiente') {
            tempStatus[d].hasPending = true;
          }
        });

        const completed: Date[] = [];
        const failed: Date[] = [];
        const pending: Date[] = [];

        Object.entries(tempStatus).forEach(([dateStr, status]) => {
          const dateObj = new Date(dateStr + 'T12:00:00');
          
          if (status.hasFailure) {
            failed.push(dateObj); 
          } else if (status.hasPending) {
            pending.push(dateObj);
          } else {
            completed.push(dateObj); 
          }
        });

        setStatusDates({ completed, failed, pending });
      }
    };
    fetchCalendarStatus();
  }, [tenantId, profile]);

  // Cargar detalle del día seleccionado
  useEffect(() => {
    if (!tenantId || !date) return;

    const fetchDayTasks = async () => {
      setLoading(true);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      let query = supabase
        .from('task_instances')
        .select(`
          id,
          estado,
          fecha_programada,
          hora_limite_snapshot,
          routine_templates (nombre, prioridad),
          pdv (nombre, ciudad),
          profiles:completado_por (nombre, apellido)
        `)
        .eq('tenant_id', tenantId)
        .eq('fecha_programada', dateStr)
        .order('hora_limite_snapshot');

      const { data } = await query;
      setTasks(data || []);
      setLoading(false);
    };

    fetchDayTasks();
  }, [date, tenantId]);

  const modifiers = {
    failed: statusDates.failed,
    completed: statusDates.completed,
    pending: statusDates.pending
  };
  
  // Colores ajustados para modo oscuro
  const modifiersClassNames = {
    failed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200 font-bold hover:bg-red-200 dark:hover:bg-red-900/70 rounded-md",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200 font-bold hover:bg-green-200 dark:hover:bg-green-900/70 rounded-md",
    pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Calendario Operativo</h2>
        <p className="text-muted-foreground">Visualiza la programación de tareas y cumplimiento histórico.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[400px_1fr]">
        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Navegación</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                modifiers={modifiers}
                modifiersClassNames={modifiersClassNames}
                className="rounded-md border shadow p-4 w-full"
                locale={es}
              />
            </CardContent>
          </Card>

          {/* Leyenda */}
          <Card>
            <CardContent className="p-4 pt-6">
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-100 border border-green-200 dark:bg-green-900/50 dark:border-green-800" />
                  <span>Completado a tiempo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700" />
                  <span>Pendiente (En tiempo)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-100 border border-red-200 dark:bg-red-900/50 dark:border-red-800" />
                  <span>Vencido / Incumplido</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="flex flex-col h-[600px]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              <CardTitle>
                {date ? format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es }) : "Selecciona una fecha"}
              </CardTitle>
            </div>
            <CardDescription>
              {tasks.length} tareas programadas para este día.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-hidden p-0">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                <p>No hay actividad registrada para esta fecha.</p>
              </div>
            ) : (
              <ScrollArea className="h-full p-6">
                <div className="space-y-4">
                  {tasks.map((task) => {
                    // --- LÓGICA DE SEMÁFORO ---
                    const now = new Date();
                    const deadline = new Date(`${task.fecha_programada}T${task.hora_limite_snapshot || '23:59:00'}`);
                    
                    const isSuccess = task.estado === 'completada_a_tiempo' || task.estado === 'completada';
                    
                    // Es vencida si explícitamente está marcada así, o si sigue pendiente y ya pasó la hora
                    const isOverdue = 
                      task.estado === 'incumplida' || 
                      task.estado === 'completada_vencida' || 
                      (task.estado === 'pendiente' && now > deadline);

                    const isPendingOnTime = task.estado === 'pendiente' && now <= deadline;

                    // Estilos dinámicos adaptados para dark mode
                    let containerClass = "";
                    let icon = null;
                    let titleClass = "";
                    let timeClass = "";
                    
                    if (isSuccess) {
                      containerClass = "bg-green-50/40 border-green-200 dark:bg-green-900/20 dark:border-green-800";
                      icon = <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />;
                      titleClass = "text-slate-800 dark:text-slate-100";
                      timeClass = "text-green-700 dark:text-green-400";
                    } else if (isOverdue) {
                      containerClass = "bg-red-50/40 border-red-200 dark:bg-red-900/20 dark:border-red-800";
                      icon = <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400" />;
                      titleClass = "text-red-700 dark:text-red-200";
                      timeClass = "text-red-600 dark:text-red-400 font-bold";
                    } else if (isPendingOnTime) {
                      containerClass = "bg-white border-gray-200 dark:bg-slate-900 dark:border-slate-700";
                      icon = <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-slate-600" />;
                      titleClass = "text-slate-800 dark:text-slate-100";
                      timeClass = "text-muted-foreground";
                    }
                    
                    return (
                      <div 
                        key={task.id} 
                        className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${containerClass}`}
                      >
                        <div className="mt-1 shrink-0">
                          {icon}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <h4 className={`font-semibold text-sm ${titleClass}`}>
                              {task.routine_templates?.nombre}
                            </h4>
                            <div className="flex flex-col items-end">
                              <span className={`text-xs font-mono flex items-center gap-1 ${timeClass}`}>
                                <Clock className="w-3 h-3" />
                                {task.hora_limite_snapshot?.slice(0,5)}
                              </span>
                              
                              {/* Texto de Estado explícito */}
                              {isOverdue && task.estado === 'pendiente' && (
                                <span className="text-[10px] text-red-600 dark:text-red-400 font-bold uppercase mt-0.5">Vencida</span>
                              )}
                            </div>
                          </div>
                          
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            {task.pdv?.nombre} - {task.pdv?.ciudad}
                          </div>

                          {isSuccess && (
                            <div className="mt-2 text-[10px] text-green-700 bg-green-100/50 dark:bg-green-900/40 dark:text-green-300 w-fit px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3"/>
                              Completado por: {task.profiles?.nombre} {task.profiles?.apellido}
                            </div>
                          )}
                        </div>
                        
                        <div>
                          <Badge variant="outline" className="capitalize text-[10px] bg-white dark:bg-slate-800 dark:border-slate-600">
                            {task.routine_templates?.prioridad}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}