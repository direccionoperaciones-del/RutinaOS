import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Play, Loader2, CheckCircle2, AlertTriangle, RefreshCw, ServerCog, Clock, Moon, Bug, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, getLocalDate } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function CommandCenter() {
  const { toast } = useToast();
  const { tenantId } = useCurrentUser();
  
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [closeDate, setCloseDate] = useState<Date | undefined>(new Date());
  
  const [isLoadingGen, setIsLoadingGen] = useState(false);
  const [isLoadingClose, setIsLoadingClose] = useState(false);
  
  const [lastRun, setLastRun] = useState<any>(null);
  const [loadingRun, setLoadingRun] = useState(false);

  const [logsOpen, setLogsOpen] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);

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
    if (!tenantId) return;
    setLoadingMetrics(true);
    try {
      const todayStr = getLocalDate();
      const { data, error } = await supabase
        .from('task_instances')
        .select('estado, audit_status, prioridad_snapshot')
        .eq('tenant_id', tenantId)
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
  }, [tenantId]);

  const runTaskEngine = async () => {
    if (!date || !tenantId) return;
    setIsLoadingGen(true);
    setExecutionLogs([]);

    try {
      const simpleDate = format(date, "yyyy-MM-dd");
      const { data, error } = await supabase.functions.invoke('generate-daily-tasks', {
        body: { 
          date: simpleDate,
          tenant_id: tenantId 
        }
      });

      if (error) throw new Error(error.message || "Error de conexión.");
      if (data && data.error) throw new Error(data.error);

      if (data.logs && Array.isArray(data.logs)) {
        setExecutionLogs(data.logs);
        setLogsOpen(true);
      }

      toast({ 
        title: "Ejecución Finalizada", 
        description: data.message || `Tareas generadas: ${data.generated}` 
      });
      
      fetchAllData();

    } catch (error: any) {
      toast({ variant: "destructive", title: "Fallo en Ejecución", description: error.message });
    } finally {
      setIsLoadingGen(false);
    }
  };

  const runDayClose = async () => {
    if (!closeDate || !tenantId) return;
    const simpleDate = format(closeDate, "yyyy-MM-dd");
    if (!confirm(`¿Cerrar operación del día ${simpleDate}? Esto marcará TODAS las pendientes (incluyendo mensuales) como INCUMPLIDAS.`)) return;
    
    setIsLoadingClose(true);
    try {
      const { data, error } = await supabase.functions.invoke('mark-missed-tasks', {
        body: { 
          date: simpleDate,
          tenant_id: tenantId,
          force_all: true // Forzar el cierre de todo lo que esté pendiente
        }
      });

      if (error) throw new Error(error.message);
      
      toast({ title: "Cierre Completado", description: `Se cerraron ${data.updated} tareas para la fecha seleccionada.` });
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Centro de Mando</h2>
            <p className="text-muted-foreground text-sm sm:text-base">Supervisión operativa y estado del sistema.</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAllData} disabled={loadingMetrics} className="w-full sm:w-auto">
            <RefreshCw className={`w-4 h-4 mr-2 ${loadingMetrics ? 'animate-spin' : ''}`} />
            Actualizar Datos
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        
        {/* MONITOR DE AUTOMATIZACIÓN */}
        <Card className="border-blue-200 bg-blue-50/20 dark:bg-blue-900/10 h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-lg">
              <ServerCog className="w-5 h-5" /> Monitor Automático
            </CardTitle>
            <CardDescription>Generación diaria (05:00 AM)</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRun ? (
              <div className="py-4 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500"/></div>
            ) : lastRun ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
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
                  <div className="text-[10px] text-red-600 bg-red-50 p-2 rounded border border-red-100 break-words">
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
            <CardTitle className="flex items-center gap-2 text-lg">
              <Play className="w-5 h-5" /> Acciones Manuales
            </CardTitle>
            <CardDescription>Control de emergencia y cierres.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Generación de Tareas</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant={"outline"} size="sm" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "P", { locale: es }) : <span>Fecha</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                  </PopoverContent>
                </Popover>
                
                <Button onClick={runTaskEngine} disabled={isLoadingGen || !date} size="sm" className="w-full sm:w-auto">
                  {isLoadingGen ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Bug className="w-3 h-3 mr-2 opacity-70" /> Generar</>}
                </Button>
              </div>
            </div>

            <div className="border-t"></div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Cierre de Operación</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant={"outline"} size="sm" className={cn("w-full justify-start text-left font-normal", !closeDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {closeDate ? format(closeDate, "P", { locale: es }) : <span>Fecha Cierre</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={closeDate} onSelect={setCloseDate} initialFocus />
                  </PopoverContent>
                </Popover>

                <Button onClick={runDayClose} disabled={isLoadingClose || !closeDate} size="sm" variant="secondary" className="w-full sm:w-auto border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700">
                  {isLoadingClose ? <Loader2 className="w-4 h-4 animate-spin" /> : <Moon className="w-4 h-4 mr-2" />}
                  Cerrar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Marca como <strong>incumplidas</strong> todas las pendientes de este día.</p>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="flex flex-col gap-4">
          <Card className={`h-full ${metrics.incidencias > 0 ? "border-red-200 bg-red-50/30" : ""}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className={`w-5 h-5 ${metrics.incidencias > 0 ? "text-red-500" : "text-orange-500"}`} />
                Incidencias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-4xl font-bold ${metrics.incidencias > 0 ? "text-red-600" : ""}`}>
                {metrics.incidencias}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Tareas críticas o vencidas hoy.</p>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
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

      {/* LOGS MODAL */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5"/> Reporte</DialogTitle>
            <DialogDescription>Detalle del procesamiento.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 border rounded-md p-4 bg-slate-950 text-slate-100 font-mono text-xs">
            {executionLogs.length === 0 ? <p className="text-slate-500">Sin datos.</p> : (
              <div className="space-y-1">
                {executionLogs.map((log, i) => (
                  <div key={i} className={`break-words ${log.includes('✅')?'text-green-400':log.includes('⚠️')?'text-yellow-400':log.includes('❌')?'text-red-400':log.includes('⏭️')?'text-slate-500':''}`}>{log}</div>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setLogsOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}