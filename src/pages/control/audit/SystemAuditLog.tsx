import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, History, Eye, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

export default function SystemAuditLog() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const fetchLogs = async () => {
    setLoading(true);
    // Nota: En una app real con millones de registros, esto debería tener paginación server-side.
    // Para V1 traemos los últimos 100 eventos.
    const { data, error } = await supabase
      .from('system_audit_log')
      .select(`
        *,
        profiles:user_id (nombre, apellido, email)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo cargar el historial del sistema." });
    } else {
      setLogs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => 
    log.table_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.profiles?.nombre + ' ' + log.profiles?.apellido).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'create': return <Badge className="bg-green-100 text-green-800 border-green-200">Creación</Badge>;
      case 'update': return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Edición</Badge>;
      case 'delete': return <Badge className="bg-red-100 text-red-800 border-red-200">Eliminación</Badge>;
      default: return <Badge variant="outline">{action}</Badge>;
    }
  };

  const formatValue = (val: any) => {
    if (val === null || val === undefined) return <span className="text-muted-foreground italic">null</span>;
    if (typeof val === 'object') return <pre className="text-xs">{JSON.stringify(val, null, 2)}</pre>;
    if (typeof val === 'boolean') return val ? 'Sí' : 'No';
    return String(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Log del Sistema</h2>
        <p className="text-muted-foreground">Historial técnico de cambios en la configuración y datos maestros.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por tabla, acción o usuario..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={fetchLogs}>
              <History className="w-4 h-4 mr-2" /> Recargar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Entidad (Tabla)</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">Cargando historial...</TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No se encontraron registros de auditoría.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">
                            {log.profiles ? `${log.profiles.nombre} ${log.profiles.apellido}` : 'Sistema / Desconocido'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{log.profiles?.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell className="font-mono text-xs">{log.table_name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                          <Eye className="w-4 h-4 mr-2" /> Ver Cambios
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Detalle (Diff) */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Detalle del Cambio</DialogTitle>
            <DialogDescription>
              Registro ID: <span className="font-mono">{selectedLog?.id}</span>
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            {selectedLog && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm border-b pb-4">
                  <div>
                    <span className="text-muted-foreground block">Tabla afectada:</span>
                    <span className="font-medium font-mono">{selectedLog.table_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Registro ID:</span>
                    <span className="font-mono text-xs">{selectedLog.record_id}</span>
                  </div>
                </div>

                {/* Vista de Cambios (Simple Diff) */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm text-red-600 border-b border-red-200 pb-1">Valor Anterior</h4>
                    {selectedLog.old_values ? (
                      <div className="space-y-2">
                        {Object.entries(selectedLog.old_values).map(([key, val]) => (
                          <div key={key} className="text-sm border-b border-dashed pb-1">
                            <span className="font-mono text-xs text-muted-foreground block">{key}:</span>
                            <span className="text-red-700 break-all">{formatValue(val)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">N/A (Creación)</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm text-green-600 border-b border-green-200 pb-1">Nuevo Valor</h4>
                    {selectedLog.new_values ? (
                      <div className="space-y-2">
                        {Object.entries(selectedLog.new_values).map(([key, val]) => {
                          // Resaltar si cambió
                          const oldVal = selectedLog.old_values?.[key];
                          const hasChanged = JSON.stringify(oldVal) !== JSON.stringify(val);
                          
                          return (
                            <div key={key} className={`text-sm border-b border-dashed pb-1 ${hasChanged ? 'bg-green-50' : ''}`}>
                              <span className="font-mono text-xs text-muted-foreground block">{key}:</span>
                              <span className="text-green-700 break-all">{formatValue(val)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">N/A (Eliminación)</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}