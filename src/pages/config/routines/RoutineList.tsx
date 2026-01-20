import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Search, Plus, Edit, Calendar, Clock, MapPin, Camera, Box } from "lucide-react";
import { RoutineForm } from "./RoutineForm";
import { useToast } from "@/hooks/use-toast";

export default function RoutineList() {
  const { toast } = useToast();
  const [routines, setRoutines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<any>(null);

  const fetchRoutines = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('routine_templates')
      .select('*')
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
  }, []);

  const handleEdit = (routine: any) => {
    setSelectedRoutine(routine);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedRoutine(null);
    setIsModalOpen(true);
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Catálogo de Rutinas</h2>
          <p className="text-muted-foreground">Define las plantillas de tareas que se ejecutarán en los PDV.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-2" /> Nueva Rutina
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar rutina..."
              className="pl-8 max-w-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
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
                <TableRow key={routine.id}>
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
                    <div className="flex gap-2">
                      {routine.gps_obligatorio && (
                        <Badge variant="outline" title="GPS Obligatorio"><MapPin className="w-3 h-3" /></Badge>
                      )}
                      {routine.fotos_obligatorias && (
                        <Badge variant="outline" title="Fotos Obligatorias"><Camera className="w-3 h-3" /></Badge>
                      )}
                      {routine.requiere_inventario && (
                        <Badge variant="outline" title="Inventario"><Box className="w-3 h-3" /></Badge>
                      )}
                      {!routine.gps_obligatorio && !routine.fotos_obligatorias && !routine.requiere_inventario && (
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
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(routine)}>
                      <Edit className="w-4 h-4" />
                    </Button>
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