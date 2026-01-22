import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Play, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function CommandCenter() {
  const { toast } = useToast();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const runTaskEngine = async () => {
    if (!date) return;
    setIsLoading(true);
    setLastResult(null);

    try {
      // Importante: Enviar fecha como string YYYY-MM-DD simple para evitar que la Edge Function (UTC)
      // interprete una hora local (ej: 21 Enero 23:00 UTC-5) como el día siguiente (22 Enero 04:00 UTC).
      const simpleDate = format(date, "yyyy-MM-dd");

      const { data, error } = await supabase.functions.invoke('generate-daily-tasks', {
        body: { date: simpleDate }
      });

      if (error) throw error;

      setLastResult(data.message);
      toast({
        title: "Motor ejecutado",
        description: data.message,
      });

    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error al ejecutar motor",
        description: error.message || "Error desconocido",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Centro de Mando</h2>
        <p className="text-muted-foreground">Supervisión operativa y herramientas de administración.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Card: Generador de Tareas */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5 text-primary" />
              Motor de Tareas
            </CardTitle>
            <CardDescription>
              Generación manual de tareas diarias.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha a procesar:</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal bg-background",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button 
              className="w-full" 
              onClick={runTaskEngine} 
              disabled={isLoading || !date}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...
                </>
              ) : (
                "Generar Tareas"
              )}
            </Button>

            {lastResult && (
              <div className="p-3 bg-background rounded-md border text-sm text-muted-foreground mt-2 flex gap-2 items-start">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>{lastResult}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Placeholder Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Incidencias
            </CardTitle>
            <CardDescription>Resumen de problemas reportados hoy.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Sin incidencias activas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Cumplimiento
            </CardTitle>
            <CardDescription>Porcentaje de tareas completadas hoy.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0%</div>
            <p className="text-xs text-muted-foreground">0/0 tareas finalizadas</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}