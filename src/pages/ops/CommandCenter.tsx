import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Play, Loader2, CheckCircle2, AlertTriangle, RefreshCw, ServerCog, Clock, Moon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, getLocalDate } from "@/lib/utils";

export default function CommandCenter() {
  const { toast } = useToast();
  
  // State para Fecha de Generación
  const [date, setDate] = useState<Date | undefined>(new Date());
  
  // State para Fecha de Cierre (Nuevo)
  const [closeDate, setCloseDate] = useState<Date | undefined>(new Date());
  
  const [isLoadingGen, setIsLoadingGen] = useState(false);
  const [isLoadingClose, setIsLoadingClose] = useState(false);
  
  const [lastRun, setLastRun] = useState<any>(null);
  const [loadingRun, setLoadingRun] = useState(false);

  const [metrics, setMetrics] = useState({
    incidencias: 0,
    totalHoy: 0,
    completadasHoy: 0,
    porcentaje: 0
  });
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const fetchAllData = () => {
    fetchMetrics();
    fetchLastRun();
  };

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

  const fetchLastRun = async () => {
    setLoadingRun(true);
    try {
      const today = getLocalDate();
      const { data, error } = await supabase
        .from('task_generation_runs')
        .select('*')
        .eq('fecha', today)
        .maybeSingle();
      
      if (!error) {
        setLastRun(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRun(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const runTaskEngine = async () => {
    if (!date) return;
    setIsLoadingGen(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const simpleDate = format(date, "yyyy-MM-dd");
      
      const { data, error } = await supabase.functions.invoke('generate-daily-tasks', {
        body: { date: simpleDate, triggered_by: 'manual_admin', force: true },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.message);

      toast({ 
        title: "Generación Finalizada", 
        description: data.message || `Tareas generadas para ${simpleDate}.` 
      });
      
      fetchAllData();

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoadingGen(false);
    }
  };

  const runDayClose = async () => {
    if (!closeDate) return;
    
    const simpleDate = format(closeDate, "yyyy-MM-dd");
    const confirmMsg = `¿Cerrar operación del día ${simpleDate}?\n\nTodas las tareas pendientes hasta esa fecha se marcarán como INCUMPLIDAS.`;
    
    if (!confirm(confirmMsg)) return;
    
    setIsLoadingClose(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const { data, error } = await supabase.functions.invoke('mark-missed-tasks', {
        body: { date: simpleDate },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (error) throw new Error(error.message);
      
      toast({ 
        title: "Cierre Completado", 
        description: data.message || "Las tareas vencidas han sido marcadas." 
      });
      
      fetchAllData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al cerrar", description: error.message });
    } finally {
      setIsLoadingClose(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Centro de Mando</h2>
            <p className="text-muted-foreground">Supervisión operativa y estado del sistema.</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAllData} disabled={loadingMetrics}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loadingMetrics ? 'animate-spin' : ''}`} />
            Actualizar Datos
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
        
        {/* MONITOR DE AUTOMATIZACIÓN */}
        <Card className="border-blue-200 bg-blue-50/20 dark:bg-blue-900/10 h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <ServerCog className="w-5 h-5" />
              Monitor Automático
            </CardTitle>
            <CardDescription>Generación diaria (05:00 AM)</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRun ? (
              <div className="py-4 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500"/></div>
            ) : lastRun ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Estado:</span>
                  <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border ${
                    lastRun.status === 'success' ? 'bg-green-100 text-green-700 border-green-200' :
                    lastRun.status === 'running' ? 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse' :
                    'bg-red-100 text-red-700 border-red-200'
                  }`}>
                    {lastRun.status === 'success' && <CheckCircle2 className="w-3 h-3"/>}
                    {lastRun.status === 'running' && <Loader2 className="w-3 h-3 animate-spin"/>}
                    {lastRun.status === 'failed' && <AlertTriangle className="w-3 h-3"/>}
                    {lastRun.status}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground bg-background/50 p-2 rounded border">
                  <div>
                    <span className="block opacity-70">Tareas creadas</span>
                    <span className="font-mono text-sm font-medium text-foreground">{lastRun.tasks_created}</span>
                  </div>
                  <div>
                    <span className="block opacity-70">Hora inicio</span>
                    <span className="font-mono text-foreground">
                      {format(new Date(lastRun.started_at), 'HH:mm:ss')}
                    </span>
                  </div>
                </div>

                {lastRun.error_message && (
                  <div className="text-[10px] text-red-600 bg-red-50 p-2 rounded border border-red-100">
                    {lastRun.error_message}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Clock className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Aún no se ha ejecutado hoy.<br/>
                  <span className="text-xs opacity-70">Programado para 05:00 AM</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ACCIONES MANUALES */}
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              Acciones Manuales
            </CardTitle>
            <CardDescription>Control de emergencia y cierres.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Generar Tareas */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Generación de Tareas</span>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      size="sm"
                      className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "P", { locale: es }) : <span>Fecha</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                  </PopoverContent>
                </Popover>
                
                <Button onClick={runTaskEngine} disabled={isLoadingGen || !date} size="sm" className="w-[100px]">
                  {isLoadingGen ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generar"}
                </Button>
              </div>
            </div>

            <div className="border-t"></div>

            {/* Cierre de Día */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Cierre de Operación</span>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      size="sm"
                      className={cn("flex-1 justify-start text-left font-normal", !closeDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {closeDate ? format(closeDate, "P", { locale: es }) : <span>Fecha Cierre</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={closeDate} onSelect={setCloseDate} initialFocus />
                  </PopoverContent>
                </Popover>

                <Button onClick={runDayClose} disabled={isLoadingClose || !closeDate} size="sm" variant="secondary" className="w-[100px] border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700">
                  {isLoadingClose ? <Loader2 className="w-4 h-4 animate-spin" /> : <Moon className="w-4 h-4 mr-2" />}
                  Cerrar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Marca como <strong>incumplidas</strong> las tareas pendientes hasta la fecha seleccionada (inclusive).
              </p>
            </div>

          </CardContent>
        </Card>

        {/* Stats */}
        <div className="flex flex-col gap-4">
          <Card className={`h-full ${metrics.incidencias > 0 ? "border-red-200 bg-red-50/30" : ""}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className={`w-5 h-5 ${metrics.incidencias > 0 ? "text-red-500" : "text-orange-500"}`} />
                Incidencias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-4xl font-bold ${metrics.incidencias > 0 ? "text-red-600" : ""}`}>
                {metrics.incidencias}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Tareas críticas o vencidas hoy.
              </p>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Avance Diario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-4xl font-bold">{metrics.porcentaje}%</div>
                <span className="text-sm text-muted-foreground">/ 100%</span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full mt-2 overflow-hidden">
                <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${metrics.porcentaje}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}