import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Play, Loader2, CheckCircle2, AlertTriangle, RefreshCw, XCircle, Terminal, Info, Moon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, getLocalDate } from "@/lib/utils";

export default function CommandCenter() {
  const { toast } = useToast();
  const [date, setDate] = useState<Date | undefined>(new Date());
  
  // States Generador
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  
  // States Cierre
  const [isClosing, setIsClosing] = useState(false);

  // Metrics
  const [metrics, setMetrics] = useState({
    incidencias: 0,
    totalHoy: 0,
    completadasHoy: 0,
    porcentaje: 0
  });
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const todayStr = getLocalDate();
      const { data, error } = await supabase
        .from('task_instances')
        .select('estado, audit_status, prioridad_snapshot')
        .eq('fecha_programada', todayStr);

      if (error) throw error;

      if (data) {
        const total = data.length;
        const completadas = data.filter(t => t.estado.startsWith('completada')).length;
        const incidencias = data.filter(t => 
          t.estado === 'incumplida' || 
          t.estado === 'completada_vencida' || 
          t.audit_status === 'rechazado' ||
          (t.prioridad_snapshot === 'critica' && t.estado === 'pendiente')
        ).length;

        setMetrics({
          incidencias,
          totalHoy: total,
          completadasHoy: completadas,
          porcentaje: total > 0 ? Math.round((completadas / total) * 100) : 0
        });
      }
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const runTaskEngine = async () => {
    if (!date) return;
    setIsLoading(true);
    setLastResult(null);
    setDebugError(null);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error("Sesión expirada. Recarga la página.");
      }

      const token = session.access_token;
      const simpleDate = format(date, "yyyy-MM-dd");
      
      const { data, error } = await supabase.functions.invoke('generate-daily-tasks', {
        body: { date: simpleDate },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (error) throw new Error(error.message || "Error de conexión con el motor");
      if (data && data.ok === false) throw new Error(data.message || "Error lógico en el motor");

      setLastResult({
        success: true,
        message: data.message,
        details: data 
      });

      if (data.generated > 0) {
        toast({ title: "Éxito", description: `Se crearon ${data.generated} tareas nuevas.`, className: "bg-green-50 text-green-800" });
      } else {
        toast({ title: "Proceso completado", description: "No se generaron tareas nuevas (ver detalles).", variant: "default" });
      }
      
      if (simpleDate === getLocalDate()) fetchMetrics();

    } catch (error: any) {
      setDebugError(error.message);
      toast({ variant: "destructive", title: "Error", description: "Fallo en la ejecución." });
    } finally {
      setIsLoading(false);
    }
  };

  const runNightlyClose = async () => {
    setIsClosing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const { data, error } = await supabase.functions.invoke('mark-missed-tasks', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (error) throw error;

      toast({ 
        title: "Cierre Ejecutado", 
        description: data.message || `Se marcaron ${data.updated} tareas como incumplidas.`,
        className: "bg-blue-50 text-blue-900 border-blue-200"
      });
      
      fetchMetrics();

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error en Cierre", description: error.message });
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Centro de Mando</h2>
            <p className="text-muted-foreground">Supervisión operativa y herramientas de administración.</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchMetrics} disabled={loadingMetrics}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loadingMetrics ? 'animate-spin' : ''}`} />
            Actualizar Datos
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Generador de Tareas */}
        <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5 text-primary" />
              Motor de Tareas
            </CardTitle>
            <CardDescription>Generación manual de tareas diarias.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha a procesar:</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal bg-background", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <Button className="w-full" onClick={runTaskEngine} disabled={isLoading || !date}>
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</> : "Generar Tareas"}
            </Button>

            {lastResult && (
              <div className="mt-3 p-3 rounded-md bg-white dark:bg-slate-900 border shadow-sm text-sm space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  {lastResult.message}
                </div>
                
                {lastResult.details?.diagnosis && (
                  <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded text-xs text-slate-600 dark:text-slate-300 space-y-1 border border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between border-b dark:border-slate-600 pb-1 mb-1">
                      <span>Total Asignaciones:</span>
                      <strong>{lastResult.details.diagnosis.total_asignaciones}</strong>
                    </div>
                    {lastResult.details.diagnosis.razones_omitidas.no_toca_hoy > 0 && (
                      <div className="flex justify-between text-orange-600 dark:text-orange-400">
                        <span>No programadas hoy:</span>
                        <span>{lastResult.details.diagnosis.razones_omitidas.no_toca_hoy}</span>
                      </div>
                    )}
                    {lastResult.details.diagnosis.razones_omitidas.sin_responsable_pdv > 0 && (
                      <div className="flex justify-between text-red-600 dark:text-red-400 font-bold">
                        <span>Sin responsable (PDV):</span>
                        <span>{lastResult.details.diagnosis.razones_omitidas.sin_responsable_pdv}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {debugError && (
              <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-xs rounded border border-red-200 dark:border-red-800">
                <strong>Error:</strong> {debugError}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cierre Nocturno */}
        <Card className="border-indigo-200 bg-indigo-50/30 dark:border-indigo-800 dark:bg-indigo-900/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Cierre de Día
            </CardTitle>
            <CardDescription className="dark:text-indigo-300">Marca como "Incumplidas" las tareas vencidas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm p-3 rounded border bg-white/50 border-indigo-100 text-indigo-900 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-200">
              <p>Este proceso corre automáticamente a las 23:59. Úsalo aquí para forzar el cierre de tareas pendientes de días anteriores.</p>
            </div>
            
            <Button 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500" 
              onClick={runNightlyClose} 
              disabled={isClosing}
            >
              {isClosing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cerrando...</> : "Ejecutar Cierre Ahora"}
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="flex flex-col gap-4">
          <Card className={metrics.incidencias > 0 ? "border-red-200 bg-red-50/30 dark:bg-red-900/10 dark:border-red-800" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className={`w-5 h-5 ${metrics.incidencias > 0 ? "text-red-500" : "text-orange-500"}`} />
                Incidencias Hoy
              </CardTitle>
              <CardDescription>Rechazos, vencimientos y tareas críticas.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={`text-4xl font-bold ${metrics.incidencias > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                {metrics.incidencias}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.incidencias === 0 ? "Sin problemas detectados" : "Requieren atención inmediata"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Cumplimiento Hoy
              </CardTitle>
              <CardDescription>Avance de la operación diaria.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-4xl font-bold">{metrics.porcentaje}%</div>
                <span className="text-sm text-muted-foreground">completado</span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full mt-2 overflow-hidden">
                <div 
                  className="bg-green-500 h-full transition-all duration-500" 
                  style={{ width: `${metrics.porcentaje}%` }} 
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {metrics.completadasHoy} de {metrics.totalHoy} tareas finalizadas
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}