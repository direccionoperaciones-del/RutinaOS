import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Search, Plus, Download, Upload, Loader2, Trash2 } from "lucide-react";
import { AssignmentForm } from "./AssignmentForm";
import { useToast } from "@/hooks/use-toast";

export default function AssignmentList() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssignments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('routine_assignments')
      .select(`
        id,
        estado,
        routine_templates (id, nombre, frecuencia),
        pdv (id, nombre, ciudad, codigo_interno)
      `)
      .order('created_at', { ascending: false });
    
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las asignaciones" });
    } else {
      setAssignments(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta asignación?")) return;
    const { error } = await supabase.from('routine_assignments').delete().eq('id', id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      toast({ title: "Eliminado", description: "Asignación eliminada correctamente." });
      fetchAssignments();
    }
  };

  // Helper for CSV Injection Prevention
  const sanitizeForCsv = (val: string | null | undefined): string => {
    if (!val) return "";
    let str = String(val).replace(/;/g, ',').trim(); 
    
    // Prevent CSV Formula Injection
    if (str.length > 0 && ['=', '+', '-', '@'].includes(str[0])) {
      str = "'" + str;
    }
    return str;
  };

  const downloadTemplate = async () => {
    setIsDownloading(true);
    try {
      // 1. Fetch reference data
      const { data: routines } = await supabase.from('routine_templates').select('nombre, frecuencia').eq('activo', true).order('nombre');
      const { data: pdvs } = await supabase.from('pdv').select('id, nombre, codigo_interno, ciudad').eq('activo', true).order('nombre');
      
      // Get responsibles for PDVs to show in template as reference
      const { data: assignments } = await supabase.from('pdv_assignments').select('pdv_id, profiles(nombre, apellido)').eq('vigente', true);
      const responsibleMap = new Map();
      assignments?.forEach((a: any) => {
        if (a.profiles) responsibleMap.set(a.pdv_id, `${a.profiles.nombre} ${a.profiles.apellido}`);
      });

      const headers = [
        "NOMBRE_RUTINA", 
        "CODIGO_PDV", 
        "", 
        "--- RUTINAS DISPONIBLES ---", 
        "FRECUENCIA", 
        "",
        "--- PDVS DISPONIBLES ---",
        "NOMBRE_PDV",
        "RESPONSABLE"
      ];

      let csvContent = headers.join(";") + "\n";
      const maxRows = Math.max(routines?.length || 0, pdvs?.length || 0, 2);

      // Example row
      const exRoutine = routines?.[0]?.nombre || "Ej: Apertura";
      const exPdv = pdvs?.[0]?.codigo_interno || "PDV-001";
      
      for (let i = 0; i < maxRows; i++) {
        const parts = [];

        // COL 1-2: Input Data
        if (i === 0) {
          parts.push(sanitizeForCsv(exRoutine));
          parts.push(sanitizeForCsv(exPdv));
        } else {
          parts.push(""); parts.push("");
        }

        // GAP
        parts.push("");

        // COL 4-5: Routines Ref
        if (routines && i < routines.length) {
          parts.push(sanitizeForCsv(routines[i].nombre));
          parts.push(sanitizeForCsv(routines[i].frecuencia));
        } else {
          parts.push(""); parts.push("");
        }

        // GAP
        parts.push("");

        // COL 7-9: PDVs Ref
        if (pdvs && i < pdvs.length) {
          const p = pdvs[i];
          const resp = responsibleMap.get(p.id) || "Sin asignar";
          parts.push(sanitizeForCsv(p.codigo_interno));
          parts.push(sanitizeForCsv(`${p.nombre} (${p.ciudad})`));
          parts.push(sanitizeForCsv(resp));
        } else {
          parts.push(""); parts.push(""); parts.push("");
        }

        csvContent += parts.join(";") + "\n";
      }

      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'plantilla_asignaciones.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Plantilla descargada", description: "Usa ';' como separador." });

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
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
      if (text) await processBatch(text);
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const processBatch = async (csvText: string) => {
    try {
      const lines = csvText.split(/\r?\n/);
      const rows = lines.slice(1).filter(line => line.trim() !== ''); // Skip header
      if (rows.length === 0) throw new Error("Archivo vacío");

      const separator = lines[0].includes(';') ? ';' : ',';
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (!profile?.tenant_id) throw new Error("Sin tenant");

      // Load maps for lookup
      const { data: rList } = await supabase.from('routine_templates').select('id, nombre').eq('tenant_id', profile.tenant_id);
      const { data: pList } = await supabase.from('pdv').select('id, codigo_interno').eq('tenant_id', profile.tenant_id);
      
      const routineMap = new Map(rList?.map(r => [r.nombre.toLowerCase().trim(), r.id]));
      const pdvMap = new Map(pList?.map(p => [p.codigo_interno.toLowerCase().trim(), p.id]));

      let successCount = 0;
      let errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const cols = rows[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
        const rName = cols[0];
        const pCode = cols[1];

        if (!rName && !pCode) continue; // Skip empty rows (maybe from references)
        if (!rName || !pCode) {
           // If one is missing but not both, it might be a data row
           // But if it's just reference columns populated, skip
           if (!rName && !pCode) continue; 
        }

        // Validate if it's a data row (cols 0 and 1 present)
        if (!rName || !pCode) continue;

        const rId = routineMap.get(rName.toLowerCase());
        const pId = pdvMap.get(pCode.toLowerCase());

        if (!rId) { errors.push(`Fila ${i+2}: Rutina "${rName}" no encontrada.`); continue; }
        if (!pId) { errors.push(`Fila ${i+2}: PDV "${pCode}" no encontrado.`); continue; }

        const { error } = await supabase.from('routine_assignments').insert({
          tenant_id: profile.tenant_id,
          rutina_id: rId,
          pdv_id: pId,
          estado: 'activa',
          created_by: user.id
        });

        if (error) {
          if (error.code === '23505') errors.push(`Fila ${i+2}: Asignación ya existe.`);
          else errors.push(`Fila ${i+2}: ${error.message}`);
        } else {
          successCount++;
        }
      }

      fetchAssignments();
      
      if (errors.length > 0) {
        toast({ variant: "default", title: "Carga finalizada con observaciones", description: `Creadas: ${successCount}. Errores: ${errors.length}` });
        alert(`Errores:\n${errors.slice(0,10).join('\n')}...`);
      } else {
        toast({ title: "Carga Exitosa", description: `Se crearon ${successCount} asignaciones.` });
      }

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const filteredAssignments = assignments.filter(a => 
    a.routine_templates?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.pdv?.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.pdv?.ciudad.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Asignación de Rutinas</h2>
          <p className="text-muted-foreground">Vincula las rutinas a los puntos de venta.</p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={handleFileUpload} />
          
          <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} 
            <span className="ml-2 hidden sm:inline">Plantilla</span>
          </Button>
          
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 
            <span className="ml-2 hidden sm:inline">Importar</span>
          </Button>

          <Button onClick={() => setIsModalOpen(true)} className="whitespace-nowrap">
            <Plus className="w-4 h-4 sm:mr-2" /> 
            <span className="hidden sm:inline">Nueva Asignación</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-none bg-transparent sm:bg-card sm:border sm:shadow">
        <CardHeader className="p-0 sm:p-6 mb-4 sm:mb-0">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por rutina, PDV o ciudad..." 
              className="pl-8 bg-white sm:bg-background" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : filteredAssignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay asignaciones registradas.</div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rutina</TableHead>
                    <TableHead>PDV</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Frecuencia</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.map((assign) => (
                    <TableRow key={assign.id}>
                      <TableCell className="font-medium">{assign.routine_templates?.nombre}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{assign.pdv?.nombre}</span>
                          <span className="text-xs text-muted-foreground font-mono">{assign.pdv?.codigo_interno}</span>
                        </div>
                      </TableCell>
                      <TableCell>{assign.pdv?.ciudad}</TableCell>
                      <TableCell className="capitalize">{assign.routine_templates?.frecuencia}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={assign.estado === 'activa' ? 'text-green-600 border-green-200 bg-green-50' : 'text-gray-500'}>
                          {assign.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(assign.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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