import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Play, Loader2, CheckCircle2, AlertTriangle, RefreshCw, XCircle, Terminal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, getLocalDate } from "@/lib/utils";

export default function CommandCenter() {
  const { toast } = useToast();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null); // Estado para mostrar el error crudo en UI
  
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
      const simpleDate = format(date, "yyyy-MM-dd");
      console.log(`🚀 Iniciando motor para: ${simpleDate}`);

      // Invocación a Edge Function
      const { data, error } = await supabase.functions.invoke('generate-daily-tasks', {
        body: { date: simpleDate }
      });

      // 1. MANEJO DE ERRORES HTTP (Captura robusta)
      if (error) {
        console.error("❌ RAW ERROR FROM SUPABASE CLIENT:", error);
        
        // Intentar decodificar el cuerpo del error si existe
        let errorDetails = error.message;
        try {
          if (error && typeof error === 'object' && 'context' in error) {
             const context = (error as any).context;
             if (context && typeof context.json === 'function') {
                const jsonBody = await context.json();
                errorDetails = `Status: ${context.status} | Body: ${JSON.stringify(jsonBody)}`;
             } else if (context && typeof context.text === 'function') {
                const textBody = await context.text();
                errorDetails = `Status: ${context.status} | Body: ${textBody}`;
             }
          }
        } catch (e) {
          errorDetails += " (No se pudo parsear el body del error)";
        }

        throw new Error(errorDetails);
      }

      // 2. MANEJO DE RESPUESTA LÓGICA (200 OK pero success: false)
      if (data && data.ok === false) {
        throw new Error(`Error Lógico: ${data.message || 'Desconocido'} (Code: ${data.code})`);
      }

      // ÉXITO
      console.log("✅ Respuesta Exitosa:", data);
      setLastResult({
        success: true,
        message: data.message || "Proceso finalizado.",
        details: data
      });

      toast({
        title: "Motor ejecutado correctamente",
        description: `Generadas: ${data.generated} | Omitidas: ${data.skipped}`,
        className: "bg-green-50 border-green-200 text-green-800"
      });
      
      if (simpleDate === getLocalDate()) fetchMetrics();

    } catch (error: any) {
      console.error("🚨 CRITICAL UI ERROR:", error);
      const msg = error.message || "Error desconocido";
      setDebugError(msg); // Mostrar en UI para debug inmediato
      
      toast({
        variant: "destructive",
        title: "Fallo Crítico en Motor",
        description: "Revisa el panel rojo para ver el error técnico real."
      });
    } finally {
      setIsLoading(false);
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
        {/* Card: Generador de Tareas */}
        <Card className="border-primary/20 bg-primary/5">
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

            {/* ERROR DEBUG BOX */}
            {debugError && (
              <div className="mt-4 p-3 bg-red-950 text-red-200 text-xs font-mono rounded border border-red-800 overflow-x-auto">
                <div className="flex items-center gap-2 mb-1 font-bold text-red-100">
                  <Terminal className="w-3 h-3" /> ERROR REAL DETECTADO:
                </div>
                {debugError}
              </div>
            )}

            {lastResult && (
              <div className={`p-3 rounded-md border text-sm flex gap-2 items-start mt-2 ${lastResult.success ? 'bg-white border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {lastResult.success ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                <div className="flex flex-col">
                  <span className="font-medium">{lastResult.message}</span>
                  {lastResult.details && (
                    <span className="text-xs mt-1 opacity-80">
                      Gen: {lastResult.details.generated} | Skip: {lastResult.details.skipped}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats y Cumplimiento */}
        <Card className={metrics.incidencias > 0 ? "border-red-200 bg-red-50/30" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${metrics.incidencias > 0 ? "text-red-500" : "text-orange-500"}`} />
              Incidencias Hoy
            </CardTitle>
            <CardDescription>Rechazos, vencimientos y tareas críticas.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${metrics.incidencias > 0 ? "text-red-600" : ""}`}>
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
  );
}