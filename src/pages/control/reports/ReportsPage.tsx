import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, Loader2, CalendarRange } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ReportsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const downloadCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) {
      toast({ variant: "destructive", title: "Sin datos", description: "No hay registros para exportar en este rango." });
      return;
    }

    // Convertir a CSV
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','), // Header row
      ...data.map(row => headers.map(fieldName => {
        // Manejar strings con comas o saltos de línea
        let val = row[fieldName];
        if (typeof val === 'string') {
          val = `"${val.replace(/"/g, '""')}"`; // Escapar comillas
        }
        return val;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateTaskReport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_instances')
        .select(`
          fecha_programada,
          estado,
          completado_at,
          routine_templates (nombre, frecuencia, prioridad),
          pdv (nombre, ciudad, codigo_interno),
          profiles:completado_por (nombre, apellido, email)
        `)
        .gte('fecha_programada', dateFrom)
        .lte('fecha_programada', dateTo);

      if (error) throw error;

      // Aplanar datos para CSV
      const flattened = data.map((item: any) => ({
        Fecha: item.fecha_programada,
        PDV_Codigo: item.pdv?.codigo_interno,
        PDV_Nombre: item.pdv?.nombre,
        Ciudad: item.pdv?.ciudad,
        Rutina: item.routine_templates?.nombre,
        Prioridad: item.routine_templates?.prioridad,
        Frecuencia: item.routine_templates?.frecuencia,
        Estado: item.estado,
        Hora_Completado: item.completado_at ? new Date(item.completado_at).toLocaleTimeString() : '',
        Usuario: item.profiles ? `${item.profiles.nombre} ${item.profiles.apellido}` : ''
      }));

      downloadCSV(flattened, `reporte_tareas_${dateFrom}_${dateTo}`);
      toast({ title: "Reporte Generado", description: "La descarga ha comenzado." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const generateAuditReport = async () => {
    setLoading(true);
    try {
      // Simulado: aquí conectarías con tabla de auditoría si quisieras más detalle
      // Por ahora usamos task_instances que tiene el estado de auditoría
      const { data, error } = await supabase
        .from('task_instances')
        .select(`
          fecha_programada,
          audit_status,
          audit_at,
          audit_notas,
          routine_templates (nombre),
          pdv (nombre)
        `)
        .gte('fecha_programada', dateFrom)
        .lte('fecha_programada', dateTo)
        .not('audit_status', 'is', null);

      if (error) throw error;

      const flattened = data.map((item: any) => ({
        Fecha: item.fecha_programada,
        PDV: item.pdv?.nombre,
        Rutina: item.routine_templates?.nombre,
        Estado_Auditoria: item.audit_status,
        Fecha_Auditoria: item.audit_at,
        Notas: item.audit_notas
      }));

      downloadCSV(flattened, `reporte_calidad_${dateFrom}_${dateTo}`);
      toast({ title: "Reporte Generado", description: "La descarga ha comenzado." });

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Reportes y Exportación</h2>
        <p className="text-muted-foreground">Descarga la data histórica para análisis externo.</p>
      </div>

      {/* Filtros Globales */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="w-4 h-4" /> Rango de Fechas
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 max-w-lg">
          <div className="space-y-2">
            <Label>Desde</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Hasta</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Reporte Operativo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              Reporte Operativo
            </CardTitle>
            <CardDescription>
              Detalle de todas las tareas ejecutadas, estados, tiempos y responsables.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={generateTaskReport} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Download className="w-4 h-4 mr-2"/>}
              Descargar CSV
            </Button>
          </CardFooter>
        </Card>

        {/* Reporte Calidad */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              Auditoría y Calidad
            </CardTitle>
            <CardDescription>
              Log de revisiones, aprobaciones, rechazos y notas de auditoría.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" variant="outline" onClick={generateAuditReport} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Download className="w-4 h-4 mr-2"/>}
              Descargar CSV
            </Button>
          </CardFooter>
        </Card>

         {/* Reporte Inventarios (Placeholder) */}
         <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-orange-600" />
              Inventarios
            </CardTitle>
            <CardDescription>
              Histórico de conteos y diferencias (Próximamente).
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" variant="secondary" disabled>
              Próximamente
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}