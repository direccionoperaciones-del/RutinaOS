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
      toast({ title: "Generando plantilla...", description: "Consultando datos maestros..." });

      // PASO 1: Obtener Rutinas Activas
      const { data: routines } = await supabase
        .from('routine_templates')
        .select('nombre, frecuencia')
        .eq('activo', true)
        .order('nombre');

      // PASO 2: Obtener PDVs Activos
      const { data: pdvs, error: pdvError } = await supabase
        .from('pdv')
        .select('id, codigo_interno, nombre, ciudad')
        .eq('activo', true)
        .order('codigo_interno');

      if (pdvError) throw pdvError;

      // PASO 3: Obtener Asignaciones VIGENTES (Solo IDs para evitar error de FK)
      const { data: activeAssignments } = await supabase
        .from('pdv_assignments')
        .select('pdv_id, user_id')
        .eq('vigente', true);

      // PASO 4: Obtener Nombres de Usuarios (Basado en los IDs de assignments)
      // Extraemos IDs únicos para consultar perfiles
      const userIds = activeAssignments?.map(a => a.user_id).filter(Boolean) || [];
      const uniqueUserIds = [...new Set(userIds)];
      
      let profilesMap = new Map<string, string>();
      
      if (uniqueUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nombre, apellido')
          .in('id', uniqueUserIds);
          
        profiles?.forEach(p => {
          profilesMap.set(p.id, `${p.nombre} ${p.apellido}`);
        });
      }

      // PASO 5: Mapear PDV -> Nombre Responsable
      const responsibleMap = new Map<string, string>();
      activeAssignments?.forEach((a: any) => {
        if (a.user_id && profilesMap.has(a.user_id)) {
          responsibleMap.set(a.pdv_id, profilesMap.get(a.user_id) || "Desconocido");
        }
      });

      // 6. Construir CSV
      const headers = [
        "NOMBRE_RUTINA", 
        "CODIGO_PDV", 
        "", "", "", // Gap 1
        "--- REF: RUTINAS (COPIAR NOMBRE) ---", 
        "FRECUENCIA",
        "", "", "", // Gap 2
        "--- REF: PDVS (COPIAR CODIGO) ---",
        "NOMBRE PDV",
        "RESPONSABLE ACTUAL"
      ];

      let csvContent = headers.join(";") + "\n";

      // Determinar máximo de filas necesarias
      const maxRows = Math.max(routines?.length || 0, pdvs?.length || 0, 2); 

      const clean = (str: string) => str ? str.replace(/;/g, ',').trim() : '';

      for (let i = 0; i < maxRows; i++) {
        const parts = [];

        // BLOQUE 1: DATOS DE CARGA (Cols A, B) - Ejemplo en fila 0
        if (i === 0) {
          const exRoutine = routines?.[0]?.nombre || "Nombre Rutina";
          const exPdv = pdvs?.[0]?.codigo_interno || "CODIGO";
          parts.push(exRoutine);
          parts.push(exPdv);
        } else {
          parts.push(""); // A
          parts.push(""); // B
        }

        // GAP 1
        parts.push(""); parts.push(""); parts.push("");

        // BLOQUE 2: REFERENCIA RUTINAS (Cols F, G)
        if (routines && i < routines.length) {
          parts.push(clean(routines[i].nombre));
          parts.push(clean(routines[i].frecuencia));
        } else {
          parts.push(""); parts.push("");
        }

        // GAP 2
        parts.push(""); parts.push(""); parts.push("");

        // BLOQUE 3: REFERENCIA PDVS (Cols K, L, M)
        if (pdvs && i < pdvs.length) {
          const p = pdvs[i];
          const responsable = responsibleMap.get(p.id) || "Sin asignar";
          
          parts.push(clean(p.codigo_interno));
          parts.push(`${clean(p.nombre)} (${clean(p.ciudad)})`);
          parts.push(clean(responsable));
        } else {
          parts.push(""); parts.push(""); parts.push("");
        }

        csvContent += parts.join(";") + "\n";
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

      toast({ title: "Descarga completa", description: "Plantilla actualizada con responsables vigentes." });

    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Error generando la plantilla: " + error.message });
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
    const { data: dbRoutines } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true);
    const routineMap = new Map();
    dbRoutines?.forEach(r => routineMap.set(r.nombre.toLowerCase().trim(), r.id));

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

      // Ignorar filas vacías o de solo referencia
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
        
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".csv,.txt" 
            onChange={handleFileUpload} 
          />
          
          <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={isDownloading} title="Descargar plantilla con referencias">
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} 
            <span className="ml-2 hidden sm:inline">Plantilla</span>
          </Button>
          
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 
            <span className="ml-2 hidden sm:inline">Carga Masiva</span>
          </Button>

          <Button onClick={() => setIsModalOpen(true)} size="sm" className="whitespace-nowrap">
            <Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Nueva Asignación</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-none bg-transparent sm:bg-card sm:border sm:shadow">
        <CardHeader className="flex flex-col sm:flex-row gap-4 space-y-0 p-0 sm:p-6 mb-4 sm:mb-0">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por PDV o Rutina..."
              className="pl-8 bg-white sm:bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-[250px]">
            <Select value={filterRoutine} onValueChange={setFilterRoutine}>
              <SelectTrigger className="bg-white sm:bg-background">
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
        
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          
          {/* --- MOBILE VIEW: CARDS --- */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredAssignments.map((assignment) => (
              <Card key={assignment.id} className="p-4 border-l-4 border-l-primary shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-sm">{assignment.routine_templates?.nombre}</h3>
                  <Badge variant={assignment.estado === 'activa' ? 'default' : 'secondary'} className="text-[10px]">
                    {assignment.estado}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
                  <Store className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{assignment.pdv?.nombre}</span>
                  <span className="text-xs text-muted-foreground">({assignment.pdv?.codigo_interno})</span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-dashed">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                    <CalendarClock className="w-3 h-3" />
                    <span className="capitalize">{assignment.routine_templates?.frecuencia}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive h-8 px-2 hover:bg-destructive/10"
                    onClick={() => handleDelete(assignment.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Eliminar
                  </Button>
                </div>
              </Card>
            ))}
            {filteredAssignments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">No se encontraron asignaciones.</div>
            )}
          </div>

          {/* --- DESKTOP VIEW: TABLE --- */}
          <div className="hidden md:block rounded-md border overflow-hidden">
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