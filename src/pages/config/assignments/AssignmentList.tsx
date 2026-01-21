import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Search, Plus, Trash2, Link, Filter, Store, CalendarClock, Download, Upload, Loader2, ClipboardList } from "lucide-react";
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
  
  // Estados para carga masiva
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uniqueRoutines, setUniqueRoutines] = useState<any[]>([]);

  const fetchAssignments = async () => {
    setLoading(true);
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

  // --- LOGICA DE PLANTILLA Y CARGA MASIVA ---

  const downloadTemplate = async () => {
    setIsDownloading(true);
    try {
      toast({ title: "Generando plantilla...", description: "Consultando rutinas y PDVs activos..." });

      // 1. Obtener Rutinas Activas
      const { data: routines } = await supabase
        .from('routine_templates')
        .select('nombre, frecuencia')
        .eq('activo', true)
        .order('nombre');

      // 2. Obtener PDVs Activos con Responsable
      const { data: pdvs } = await supabase
        .from('pdv')
        .select(`
          codigo_interno, 
          nombre, 
          ciudad,
          pdv_assignments (
            profiles (nombre, apellido)
          )
        `)
        .eq('activo', true)
        .order('codigo_interno');

      // 3. Construir CSV con Separadores Claros
      // Usamos 3 columnas vacías como separador visual
      const headers = [
        "NOMBRE_RUTINA", 
        "CODIGO_PDV", 
        "", "", "", // 3 columnas separadoras
        "--- REF: RUTINAS (COPIAR NOMBRE) ---", 
        "FRECUENCIA",
        "", "", "", // 3 columnas separadoras
        "--- REF: PDVS (COPIAR CODIGO) ---",
        "NOMBRE PDV",
        "RESPONSABLE ACTUAL"
      ];

      let csvContent = headers.join(";") + "\n";

      // Fila de Ejemplo
      const exRoutine = routines?.[0]?.nombre || "Apertura de Caja";
      const exPdv = pdvs?.[0]?.codigo_interno || "PDV-001";
      
      const maxRows = Math.max(routines?.length || 0, pdvs?.length || 0);

      // Fila 1: Ejemplo + Primeros datos de referencia
      // Importante: Debemos respetar los huecos de las columnas separadoras
      for (let i = 0; i < maxRows; i++) {
        let row = "";

        // BLOQUE 1: DATOS DE CARGA (Cols A, B)
        // Solo llenamos la primera fila como ejemplo
        if (i === 0) {
          row += `${exRoutine};${exPdv}`; 
        } else {
          row += `;`; // Dejar A y B vacíos
        }

        // SEPARADOR 1 (Cols C, D, E) -> 3 puntos y coma
        row += ";;;";

        // BLOQUE 2: REFERENCIA RUTINAS (Cols F, G)
        if (routines && i < routines.length) {
          row += `${routines[i].nombre};${routines[i].frecuencia}`;
        } else {
          row += `;`; // Dejar vacío si no hay más rutinas
        }

        // SEPARADOR 2 (Cols H, I, J) -> 3 puntos y coma
        row += ";;;";

        // BLOQUE 3: REFERENCIA PDVS (Cols K, L, M)
        if (pdvs && i < pdvs.length) {
          const p = pdvs[i];
          // Obtener nombre del responsable
          const responsable = p.pdv_assignments?.[0]?.profiles 
            ? `${p.pdv_assignments[0].profiles.nombre} ${p.pdv_assignments[0].profiles.apellido}`
            : "Sin asignar";

          row += `${p.codigo_interno};${p.nombre} (${p.ciudad});${responsable}`;
        } else {
          row += `;;`; // Dejar vacío si no hay más PDVs
        }

        csvContent += row + "\n";
      }

      const bom = "\uFEFF";
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'plantilla_asignacion_rutinas.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Descarga completa", description: "Usa las columnas de referencia para llenar los datos exactos." });

    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Error generando la plantilla." });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (text) {
        try {
          await processBatch(text);
        } catch (error: any) {
          toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const processBatch = async (csvText: string) => {
    const lines = csvText.split(/\r?\n/);
    const rows = lines.slice(1).filter(line => line.trim() !== '');
    
    if (rows.length === 0) throw new Error("Archivo vacío.");

    const separator = lines[0].includes(';') ? ';' : ',';

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");
    
    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
    if (!profile?.tenant_id) throw new Error("Sin tenant.");

    // 1. Cargar Mapas de IDs para validación rápida
    // Mapa Rutinas: Nombre -> ID
    const { data: dbRoutines } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true);
    const routineMap = new Map();
    dbRoutines?.forEach(r => routineMap.set(r.nombre.toLowerCase().trim(), r.id));

    // Mapa PDVs: Código -> ID
    const { data: dbPdvs } = await supabase.from('pdv').select('id, codigo_interno').eq('activo', true);
    const pdvMap = new Map();
    dbPdvs?.forEach(p => pdvMap.set(p.codigo_interno.toLowerCase().trim(), p.id));

    let successCount = 0;
    let errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cols = row.split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
      
      const routineName = cols[0];
      const pdvCode = cols[1];

      // Ignorar filas de solo referencia (donde no hay datos a la izquierda)
      if (!routineName || !pdvCode) continue;

      const routineId = routineMap.get(routineName.toLowerCase());
      const pdvId = pdvMap.get(pdvCode.toLowerCase());

      if (!routineId) {
        errors.push(`Fila ${i+2}: Rutina "${routineName}" no encontrada.`);
        continue;
      }
      if (!pdvId) {
        errors.push(`Fila ${i+2}: PDV con código "${pdvCode}" no encontrado.`);
        continue;
      }

      // Intentar Insertar
      try {
        const { error } = await supabase
          .from('routine_assignments')
          .insert({
            tenant_id: profile.tenant_id,
            rutina_id: routineId,
            pdv_id: pdvId,
            estado: 'activa',
            created_by: user.id
          });

        if (error) {
          if (error.code === '23505') { // Unique violation
             errors.push(`Fila ${i+2}: La asignación ya existía (${routineName} -> ${pdvCode}).`);
          } else {
             throw error;
          }
        } else {
          successCount++;
        }
      } catch (err: any) {
        errors.push(`Fila ${i+2}: Error desconocido - ${err.message}`);
      }
    }

    fetchAssignments();

    if (errors.length > 0) {
      toast({
        variant: "default",
        title: "Proceso finalizado con observaciones",
        description: `Asignadas: ${successCount}. Alertas: ${errors.length}.`,
        duration: 5000
      });
      alert(`Reporte de Carga:\n\nAsignaciones Nuevas: ${successCount}\n\nObservaciones:\n${errors.slice(0, 10).join('\n')}\n${errors.length > 10 ? '...' : ''}`);
    } else {
      toast({ title: "Carga Exitosa", description: `Se crearon ${successCount} nuevas asignaciones.` });
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
        
        <div className="flex gap-2 w-full sm:w-auto">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".csv,.txt" 
            onChange={handleFileUpload} 
          />
          
          <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={isDownloading} title="Descargar plantilla con referencias">
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />} 
            Plantilla
          </Button>
          
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />} 
            Carga Masiva
          </Button>

          <Button onClick={() => setIsModalOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" /> Nueva Asignación
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row gap-4 space-y-0 p-4 sm:p-6">
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
        <CardContent className="p-0 sm:p-6 pt-0">
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Rutina</TableHead>
                  <TableHead>PDV Asignado</TableHead>
                  <TableHead className="hidden sm:table-cell">Frecuencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right pr-4">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium pl-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-primary/10 rounded-md text-primary">
                          <ClipboardList className="w-4 h-4" />
                        </div>
                        {assignment.routine_templates?.nombre}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium flex items-center gap-1">
                           <Store className="w-3 h-3 text-muted-foreground" />
                           {assignment.pdv?.nombre}
                        </span>
                        <span className="text-xs text-muted-foreground ml-4">
                          {assignment.pdv?.ciudad} ({assignment.pdv?.codigo_interno})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize hidden sm:table-cell">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <CalendarClock className="w-3 h-3" />
                        {assignment.routine_templates?.frecuencia}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={assignment.estado === 'activa' ? 'default' : 'secondary'}>
                        {assignment.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-4">
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
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <Link className="w-8 h-8 mb-2 opacity-20" />
                        <p>No hay asignaciones que coincidan con los filtros.</p>
                      </div>
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