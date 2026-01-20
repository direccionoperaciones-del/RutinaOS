import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, Calendar as CalendarIcon, MapPin, CheckCircle2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function CalendarPage() {
  const { tenantId } = useCurrentUser();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [markedDates, setMarkedDates] = useState<Date[]>([]);

  // Cargar fechas con tareas para marcar en el calendario (vista mensual)
  useEffect(() => {
    if (!tenantId) return;
    
    const fetchMonthTasks = async () => {
      // Traemos tareas del mes actual y siguiente para los indicadores
      const { data } = await supabase
        .from('task_instances')
        .select('fecha_programada')
        .eq('tenant_id', tenantId)
        .limit(100);
      
      if (data) {
        const dates = data.map(t => new Date(t.fecha_programada + 'T12:00:00')); // T12:00 para evitar problemas de timezone
        setMarkedDates(dates);
      }
    };
    fetchMonthTasks();
  }, [tenantId]);

  // Cargar detalle del día seleccionado
  useEffect(() => {
    if (!tenantId || !date) return;

    const fetchDayTasks = async () => {
      setLoading(true);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const { data } = await supabase
        .from('task_instances')
        .select(`
          id,
          estado,
          hora_limite_snapshot,
          routine_templates (nombre, prioridad),
          pdv (nombre, ciudad),
          profiles:completado_por (nombre, apellido)
        `)
        .eq('tenant_id', tenantId)
        .eq('fecha_programada', dateStr)
        .order('hora_limite_snapshot');

      setTasks(data || []);
      setLoading(false);
    };

    fetchDayTasks();
  }, [date, tenantId]);

  // Modificadores para el calendario
  const modifiers = {
    hasTask: markedDates
  };
  
  const modifiersStyles = {
    hasTask: {
      fontWeight: 'bold',
      textDecoration: 'underline',
      color: 'var(--primary)'
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Calendario Operativo</h2>
        <p className="text-muted-foreground">Visualiza la programación de tareas y cumplimiento histórico.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[400px_1fr]">
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
              modifiersStyles={modifiersStyles}
              className="rounded-md border shadow p-4"
              locale={es}
            />
          </CardContent>
        </Card>

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
                  {tasks.map((task) => (
                    <div 
                      key={task.id} 
                      className={`flex items-start gap-4 p-4 rounded-lg border ${task.estado === 'completada' ? 'bg-green-50/50 border-green-100' : 'bg-card'}`}
                    >
                      <div className="mt-1">
                        {task.estado === 'completada' ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <div className={`w-5 h-5 rounded-full border-2 ${task.routine_templates?.prioridad === 'critica' ? 'border-red-400' : 'border-gray-300'}`} />
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h4 className="font-semibold text-sm">{task.routine_templates?.nombre}</h4>
                          <span className="text-xs text-muted-foreground font-mono">
                            Vence: {task.hora_limite_snapshot?.slice(0,5)}
                          </span>
                        </div>
                        
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          {task.pdv?.nombre} - {task.pdv?.ciudad}
                        </div>

                        {task.estado === 'completada' && (
                          <div className="mt-2 text-xs text-green-700 bg-green-100 w-fit px-2 py-0.5 rounded-full">
                            Completado por: {task.profiles?.nombre} {task.profiles?.apellido}
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {task.routine_templates?.prioridad}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}