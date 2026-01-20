import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Search, Plus, Trash2, Link, Filter } from "lucide-react";
import { AssignmentForm } from "./AssignmentForm";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AssignmentList() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterRoutine, setFilterRoutine] = useState("all");
  
  // Para filtros
  const [uniqueRoutines, setUniqueRoutines] = useState<any[]>([]);

  const fetchAssignments = async () => {
    setLoading(true);
    // Join con Routine y PDV
    const { data, error } = await supabase
      .from('routine_assignments')
      .select(`
        id,
        estado,
        created_at,
        routine_templates (id, nombre, frecuencia, prioridad),
        pdv (id, nombre, ciudad, codigo_interno)
      `)
      .order('created_at', { ascending: false });
    
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las asignaciones" });
    } else {
      setAssignments(data || []);
      
      // Extraer rutinas únicas para el filtro
      const routinesMap = new Map();
      data?.forEach((item: any) => {
        if (item.routine_templates) {
          routinesMap.set(item.routine_templates.id, item.routine_templates.nombre);
        }
      });
      setUniqueRoutines(Array.from(routinesMap.entries()).map(([id, nombre]) => ({ id, nombre })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta asignación? La rutina dejará de aparecer en el PDV.")) return;

    const { error } = await supabase
      .from('routine_assignments')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar" });
    } else {
      toast({ title: "Eliminado", description: "Asignación removida correctamente" });
      fetchAssignments();
    }
  };

  const filteredAssignments = assignments.filter(a => {
    const matchesSearch = 
      a.pdv?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.routine_templates?.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRoutine = filterRoutine === "all" || a.routine_templates?.id === filterRoutine;

    return matchesSearch && matchesRoutine;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Asignación de Rutinas</h2>
          <p className="text-muted-foreground">Vincula tus rutinas operativas a los puntos de venta correspondientes.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nueva Asignación
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row gap-4 space-y-0">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por PDV o Rutina..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-[250px]">
            <Select value={filterRoutine} onValueChange={setFilterRoutine}>
              <SelectTrigger>
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filtrar por Rutina" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las rutinas</SelectItem>
                {uniqueRoutines.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rutina</TableHead>
                  <TableHead>PDV Asignado</TableHead>
                  <TableHead>Frecuencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link className="w-3 h-3 text-muted-foreground" />
                        {assignment.routine_templates?.nombre}
                      </div>
                    </TableCell>
                    <TableCell>
                      {assignment.pdv?.nombre}
                      <span className="text-xs text-muted-foreground ml-2">({assignment.pdv?.ciudad})</span>
                    </TableCell>
                    <TableCell className="capitalize">{assignment.routine_templates?.frecuencia}</TableCell>
                    <TableCell>
                      <Badge variant={assignment.estado === 'activa' ? 'default' : 'secondary'}>
                        {assignment.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(assignment.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredAssignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No hay asignaciones que coincidan con los filtros.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AssignmentForm 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        onSuccess={fetchAssignments}
      />
    </div>
  );
}