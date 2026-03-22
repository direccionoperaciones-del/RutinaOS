import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Plus, Edit, Calendar, Clock, MapPin, Camera, Box, MessageSquareText, FileText, Mail, Zap, Loader2, Play } from "lucide-react";
import { RoutineForm } from "./RoutineForm";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { format } from "date-fns";

export default function RoutineList() {
  const { toast } = useToast();
  const { tenantId } = useCurrentUser();
  const [routines, setRoutines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<any>(null);
  
  // Estado para controlar qué rutina se está ejecutando manualmente
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);

  const fetchRoutines = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('routine_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('nombre', { ascending: true });
    
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las rutinas" });
    } else {
      setRoutines(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRoutines();
  }, [tenantId]);

  const handleEdit = (routine: any) => {
    setSelectedRoutine(routine);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedRoutine(null);
    setIsModalOpen(true);
  };

  const handleRunNow = async (routine: any) => {
    if (!confirm(`¿Estás seguro de generar las tareas para "${routine.nombre}" AHORA?\n\nEsto creará las tareas pendientes para hoy en todos los PDVs asignados.`)) {
      return;
    }

    setRunningRoutineId(routine.id);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase.functions.invoke('generate-daily-tasks', {
        body: {
          date: today,
          tenant_id: tenantId,
          routine_id: routine.id // Parametro clave para forzar ejecución individual
        }
      });

      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      toast({ 
        title: "Ejecución Exitosa", 
        description: data.message || "Tareas generadas correctamente." 
      });

    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: error.message || "No se pudo ejecutar la rutina." });
    } finally {
      setRunningRoutineId(null);
    }
  };

  const filteredRoutines = routines.filter(r => 
    r.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'baja': return 'bg-gray-500 hover:bg-gray-600';
      case 'media': return 'bg-blue-500 hover:bg-blue-600';
      case 'alta': return 'bg-orange-500 hover:bg-orange-600';
      case 'critica': return 'bg-red-500 hover:bg-red-600';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Catálogo de Rutinas</h2>
          <p className="text-muted-foreground">Define las plantillas de tareas que se ejecutarán en los PDV.</p>
        </div>
        <Button onClick={handleCreate} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" /> Nueva Rutina
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar rutina..."
          className="pl-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* --- VISTA MÓVIL: TARJETAS --- */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {filteredRoutines.map((routine) => (
          <Card key={routine.id} className="overflow-hidden border-l-4 shadow-sm" style={{ borderLeftColor: 'var(--primary)' }}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg">{routine.nombre}</h3>
                <Badge className={getPriorityColor(routine.prioridad)}>{routine.prioridad}</Badge>
              </div>
              
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                {routine.descripcion}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-4">
                <div className="flex items-center gap-1 bg-muted/50 p-1.5 rounded">
                  <Calendar className="w-3 h-3" /> 
                  <span className="capitalize">{routine.frecuencia}</span>
                </div>
                <div className="flex items-center gap-1 bg-muted/50 p-1.5 rounded">
                  <Clock className="w-3 h-3" /> 
                  {routine.hora_inicio?.slice(0,5)} - {routine.hora_limite?.slice(0,5)}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-dashed">
                <div className="flex gap-2">
                  {routine.gps_obligatorio && <MapPin className="w-4 h-4 text-blue-500" />}
                  {routine.fotos_obligatorias && <Camera className="w-4 h-4 text-purple-500" />}
                  {routine.requiere_inventario && <Box className="w-4 h-4 text-orange-500" />}
                  {routine.comentario_obligatorio && <MessageSquareText className="w-4 h-4 text-yellow-500" />}
                  {routine.archivo_obligatorio && <FileText className="w-4 h-4 text-cyan-500" />}
                  {(routine.enviar_email || routine.responder_email) && <Mail className="w-4 h-4 text-pink-500" />}
                </div>
                <div className="flex gap-2">
                  {routine.activo && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 w-8 p-0 border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100"
                      onClick={() => handleRunNow(routine)}
                      disabled={runningRoutineId === routine.id}
                    >
                      {runningRoutineId === routine.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Zap className="w-4 h-4 fill-orange-600" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(routine)} className="h-8">
                    Editar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* --- VISTA DESKTOP: TABLA --- */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Frecuencia</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Requisitos</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoutines.map((routine) => (
                <TableRow key={routine.id} className={!routine.activo ? "opacity-60 bg-muted/20" : ""}>
                  <TableCell>
                    <div className="font-medium">{routine.nombre}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">{routine.descripcion}</div>
                  </TableCell>
                  <TableCell className="capitalize">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      {routine.frecuencia}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {routine.hora_inicio?.slice(0,5)} - {routine.hora_limite?.slice(0,5)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5 flex-wrap">
                      {routine.gps_obligatorio && (
                        <Badge variant="outline" className="px-1.5 py-0.5 border-blue-200 bg-blue-50 text-blue-700" title="GPS Obligatorio">
                          <MapPin className="w-3 h-3" />
                        </Badge>
                      )}
                      {routine.fotos_obligatorias && (
                        <Badge variant="outline" className="px-1.5 py-0.5 border-purple-200 bg-purple-50 text-purple-700" title={`Fotos Obligatorias (${routine.min_fotos || 1})`}>
                          <Camera className="w-3 h-3" />
                        </Badge>
                      )}
                      {routine.requiere_inventario && (
                        <Badge variant="outline" className="px-1.5 py-0.5 border-orange-200 bg-orange-50 text-orange-700" title="Inventario">
                          <Box className="w-3 h-3" />
                        </Badge>
                      )}
                      {routine.comentario_obligatorio && (
                        <Badge variant="outline" className="px-1.5 py-0.5 border-yellow-200 bg-yellow-50 text-yellow-700" title="Comentario Obligatorio">
                          <MessageSquareText className="w-3 h-3" />
                        </Badge>
                      )}
                      {routine.archivo_obligatorio && (
                        <Badge variant="outline" className="px-1.5 py-0.5 border-cyan-200 bg-cyan-50 text-cyan-700" title="Archivo Adjunto">
                          <FileText className="w-3 h-3" />
                        </Badge>
                      )}
                      {(routine.enviar_email || routine.responder_email) && (
                        <Badge variant="outline" className="px-1.5 py-0.5 border-pink-200 bg-pink-50 text-pink-700" title="Gestión Email">
                          <Mail className="w-3 h-3" />
                        </Badge>
                      )}
                      
                      {!routine.gps_obligatorio && !routine.fotos_obligatorias && !routine.requiere_inventario && !routine.comentario_obligatorio && !routine.archivo_obligatorio && !routine.enviar_email && !routine.responder_email && (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getPriorityColor(routine.prioridad)}>
                      {routine.prioridad}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {routine.activo && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-xs border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                          onClick={() => handleRunNow(routine)}
                          disabled={runningRoutineId === routine.id}
                          title="Generar tareas de esta rutina para HOY"
                        >
                          {runningRoutineId === routine.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Zap className="w-3 h-3 mr-1.5 fill-orange-600" />}
                          Ejecutar
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(routine)} className="h-8 w-8">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredRoutines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    No se encontraron rutinas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RoutineForm 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        routineToEdit={selectedRoutine}
        onSuccess={fetchRoutines}
      />
    </div>
  );
}