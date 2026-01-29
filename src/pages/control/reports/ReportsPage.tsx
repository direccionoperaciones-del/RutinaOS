import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, Loader2, CalendarRange, CheckCircle2, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getLocalDate, openDatePicker } from "@/lib/utils";

export default function ReportsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const todayStr = getLocalDate();
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

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
        // Manejar strings con comas o saltos de línea y valores nulos
        let val = row[fieldName];
        if (val === null || val === undefined) {
          val = "";
        } else if (typeof val === 'string') {
          // Prevent CSV Formula Injection
          if (val.length > 0 && ['=', '+', '-', '@'].includes(val[0])) {
            val = "'" + val;
          }
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
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const generateAuditReport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_instances')
        .select(`
          fecha_programada,
          audit_status,
          audit_at,
          audit_notas,
          routine_templates (nombre),
          pdv (nombre),
          auditor:audit_by (nombre, apellido) 
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
        Fecha_Auditoria: item.audit_at ? new Date(item.audit_at).toLocaleString() : '',
        Auditor: item.auditor ? `${item.auditor.nombre} ${item.auditor.apellido}` : 'Sistema',
        Notas: item.audit_notas
      }));

      downloadCSV(flattened, `reporte_calidad_${dateFrom}_${dateTo}`);
      toast({ title: "Reporte Generado", description: "La descarga ha comenzado." });

    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const generateInventoryReport = async () => {
    setLoading(true);
    try {
      const { data: tasks, error: taskError } = await supabase
        .from('task_instances')
        .select('id, routine_templates!inner(requiere_inventario)')
        .eq('routine_templates.requiere_inventario', true) 
        .gte('fecha_programada', dateFrom)
        .lte('fecha_programada', dateTo);

      if (taskError) throw taskError;

      if (!tasks || tasks.length === 0) {
        toast({ variant: "destructive", title: "Sin datos", description: "No se encontraron tareas de inventario en este rango." });
        return;
      }

      const taskIds = tasks.map(t => t.id);

      const { data, error } = await supabase
        .from('inventory_submission_rows')
        .select(`
          fisico,
          esperado,
          diferencia,
          created_at,
          inventory_products (nombre, codigo_sku, unidad),
          task_instances (
            fecha_programada,
            pdv (nombre, ciudad),
            routine_templates (nombre)
          )
        `)
        .in('task_id', taskIds);

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({ 
          variant: "destructive", 
          title: "Sin registros", 
          description: `Se encontraron ${taskIds.length} tareas de inventario, pero ninguna tiene datos guardados aún.` 
        });
        return;
      }

      const flattened = data.map((item: any) => ({
        Fecha: item.task_instances?.fecha_programada,
        PDV: item.task_instances?.pdv?.nombre,
        Ciudad: item.task_instances?.pdv?.ciudad,
        Rutina: item.task_instances?.routine_templates?.nombre,
        SKU: item.inventory_products?.codigo_sku,
        Producto: item.inventory_products?.nombre,
        Unidad: item.inventory_products?.unidad,
        Fisico: item.fisico,
        Sistema: item.esperado,
        Diferencia: item.diferencia,
        Hora_Registro: new Date(item.created_at).toLocaleTimeString()
      }));

      downloadCSV(flattened, `reporte_inventarios_${dateFrom}_${dateTo}`);
      toast({ title: "Reporte Generado", description: "Descargando detalle de inventarios." });

    } catch (error: any) {
      console.error(error);
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

      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="w-4 h-4" /> Rango de Fechas
          </CardTitle>
        </CardHeader>
        {/* GRID RESPONSIVE: 1 col mobile, 2 col desktop */}
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
          <div className="space-y-2 w-full min-w-0">
            <Label>Desde</Label>
            <div className="relative w-full">
              <CalendarIcon 
                className="absolute left-2 top-2.5 h-5 w-5 text-muted-foreground cursor-pointer z-10 hover:text-primary pointer-events-none"
              />
              <Input 
                id="date-from-report"
                type="date" 
                className="pl-10 h-10 w-full block bg-background min-w-0" 
                value={dateFrom} 
                onChange={(e) => setDateFrom(e.target.value)}
                onClick={() => openDatePicker('date-from-report')} 
              />
            </div>
          </div>
          <div className="space-y-2 w-full min-w-0">
            <Label>Hasta</Label>
            <div className="relative w-full">
              <CalendarIcon 
                className="absolute left-2 top-2.5 h-5 w-5 text-muted-foreground cursor-pointer z-10 hover:text-primary pointer-events-none"
              />
              <Input 
                id="date-to-report"
                type="date" 
                className="pl-10 h-10 w-full block bg-background min-w-0" 
                value={dateTo} 
                onChange={(e) => setDateTo(e.target.value)}
                onClick={() => openDatePicker('date-to-report')} 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
              Auditoría y Calidad
            </CardTitle>
            <CardDescription>
              Log de revisiones con detalle del auditor y notas de rechazo.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={generateAuditReport} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Download className="w-4 h-4 mr-2"/>}
              Descargar CSV
            </Button>
          </CardFooter>
        </Card>

         <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-orange-600" />
              Inventarios
            </CardTitle>
            <CardDescription>
              Histórico detallado de conteos, SKU, diferencias y stock físico vs sistema.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={generateInventoryReport} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Download className="w-4 h-4 mr-2"/>}
              Descargar CSV
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}