import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Search, Plus, MapPin, Loader2, Edit, Power, PowerOff, Download, Upload, FileSpreadsheet } from "lucide-react";
import { PDVForm } from "./PDVForm";
import { useToast } from "@/hooks/use-toast";

export default function PDVList() {
  const { toast } = useToast();
  const [pdvs, setPdvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPDV, setSelectedPDV] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPDVs = async () => {
    setLoading(true);
    const { data: simpleData, error: simpleError } = await supabase
      .from('pdv')
      .select(`
        *,
        pdv_assignments (
          vigente,
          profiles (nombre, apellido)
        )
      `)
      .order('codigo_interno', { ascending: true });
    
    if (simpleError) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los PDVs" });
    } else {
      // Procesar para obtener el responsable vigente de forma limpia
      const formatted = simpleData?.map(p => {
        const vigente = p.pdv_assignments?.find((a: any) => a.vigente);
        return {
          ...p,
          responsable_nombre: vigente?.profiles ? `${vigente.profiles.nombre} ${vigente.profiles.apellido}` : null
        };
      });
      setPdvs(formatted || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPDVs();
  }, []);

  const handleEdit = (pdv: any) => {
    setSelectedPDV(pdv);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedPDV(null);
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (pdv: any) => {
    const newStatus = !pdv.activo;
    const { error } = await supabase
      .from('pdv')
      .update({ activo: newStatus })
      .eq('id', pdv.id);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el estado" });
    } else {
      toast({ title: "Estado actualizado", description: `PDV ${newStatus ? 'activado' : 'desactivado'}` });
      fetchPDVs();
    }
  };

  // --- LOGICA DE PLANTILLA Y CARGA MASIVA ---

  const downloadTemplate = () => {
    // Encabezados del CSV (Usamos ; para mayor compatibilidad con Excel español)
    const headers = [
      "codigo_interno",
      "nombre",
      "ciudad",
      "direccion",
      "telefono",
      "latitud",
      "longitud",
      "radio_gps",
      "responsable"
    ];

    const csvContent = headers.join(";") + "\n" + "PDV-001;Tienda Central;Bogotá;Calle 123 #45-67;3001234567;4.6097;-74.0817;100;Juan Perez";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla_carga_pdv.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        await processBatch(text);
      } catch (error: any) {
        toast({ variant: "destructive", title: "Error en carga", description: error.message });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
      }
    };

    reader.readAsText(file); // Leer con encoding default (UTF-8 usualmente)
  };

  // Función auxiliar para normalizar nombres (quita espacios dobles, trim, lowercase)
  const normalizeStr = (str: string) => {
    if (!str) return "";
    return str.toLowerCase().replace(/\s+/g, ' ').trim();
  };

  const processBatch = async (csvText: string) => {
    const lines = csvText.split(/\r?\n/);
    // Saltamos el encabezado (línea 0)
    const rows = lines.slice(1).filter(line => line.trim() !== '');
    
    if (rows.length === 0) throw new Error("El archivo está vacío o solo tiene encabezados");

    // DETECTAR SEPARADOR INTELIGENTE (coma o punto y coma)
    const firstLine = lines[0];
    const separator = firstLine.includes(';') ? ';' : ',';

    // 1. Obtener Tenant ID y Usuario Actual
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");
    
    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
    if (!profile?.tenant_id) throw new Error("Sin organización asignada");

    // 2. Obtener lista de usuarios para mapear responsables
    const { data: users } = await supabase.from('profiles').select('id, nombre, apellido').eq('activo', true);
    const userMap = new Map(); 
    
    console.log("--- USUARIOS DISPONIBLES PARA ASIGNACIÓN ---");
    users?.forEach(u => {
      const fullName = `${u.nombre} ${u.apellido}`;
      const normalized = normalizeStr(fullName);
      userMap.set(normalized, u.id);
      console.log(`Original: "${fullName}" -> Normalizado: "${normalized}"`);
    });
    console.log("--------------------------------------------");

    let successCount = 0;
    let errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cols = row.split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
      
      // Validar longitud mínima
      if (cols.length < 3) continue; 

      // Mapeo seguro de columnas por índice (asumiendo orden de plantilla)
      const codigo = cols[0];
      const nombre = cols[1];
      const ciudad = cols[2];
      const direccion = cols[3];
      const telefono = cols[4];
      const lat = cols[5];
      const lng = cols[6];
      const radio = cols[7];
      const responsableName = cols[8];

      if (!codigo || !nombre || !ciudad) {
        errors.push(`Fila ${i + 2}: Faltan campos obligatorios.`);
        continue;
      }

      try {
        // Insertar PDV
        const latVal = lat ? parseFloat(lat.replace(',', '.')) : null;
        const lngVal = lng ? parseFloat(lng.replace(',', '.')) : null;
        const radioVal = radio ? parseInt(radio) : 100;

        // Upsert para actualizar si ya existe por código interno (opcional, aquí usaremos insert simple que fallará si existe)
        // Usamos insert y capturamos error de duplicado si es necesario
        const { data: newPdv, error: pdvError } = await supabase.from('pdv').insert({
          tenant_id: profile.tenant_id,
          codigo_interno: codigo,
          nombre: nombre,
          ciudad: ciudad,
          direccion: direccion || null,
          telefono: telefono || null,
          latitud: isNaN(latVal!) ? null : latVal,
          longitud: isNaN(lngVal!) ? null : lngVal,
          radio_gps: radioVal,
          activo: true
        }).select().single();

        if (pdvError) {
          if (pdvError.code === '23505') { // Unique violation
             throw new Error("El código interno o nombre ya existe.");
          }
          throw pdvError;
        }

        // Asignar Responsable
        if (responsableName && newPdv) {
          const cleanName = normalizeStr(responsableName);
          const userId = userMap.get(cleanName);
          
          if (userId) {
            await supabase.from('pdv_assignments').insert({
              tenant_id: profile.tenant_id,
              pdv_id: newPdv.id,
              user_id: userId,
              vigente: true,
              created_by: user.id
            });
          } else {
            console.warn(`Usuario no encontrado: "${cleanName}"`);
            errors.push(`Fila ${i + 2}: PDV creado, pero responsable "${responsableName}" no coincide con ningún usuario activo.`);
          }
        }

        successCount++;
      } catch (err: any) {
        console.error(err);
        errors.push(`Fila ${i + 2} (${codigo}): ${err.message}`);
      }
    }

    fetchPDVs();
    
    if (errors.length > 0) {
      toast({
        variant: "default",
        title: "Carga Finalizada con Observaciones",
        description: `Creados: ${successCount}. Hubo ${errors.length} alertas (revisa si los nombres de usuarios son exactos).`,
        duration: 8000
      });
      // Muestra una alerta simple para que el usuario vea los detalles
      alert(`Observaciones de la carga:\n\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? '\n...' : ''}`);
    } else {
      toast({ title: "Carga Masiva Exitosa", description: `Se procesaron ${successCount} registros correctamente.` });
    }
  };

  // Filtrado local
  const filteredPDVs = pdvs.filter(pdv => 
    pdv.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pdv.codigo_interno.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pdv.ciudad.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Puntos de Venta</h2>
          <p className="text-muted-foreground">Administra tus sucursales y sus ubicaciones.</p>
        </div>
        <div className="flex gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".csv,.txt" 
            onChange={handleFileUpload} 
          />
          
          <Button variant="outline" onClick={downloadTemplate} title="Descargar plantilla CSV">
            <Download className="w-4 h-4 mr-2" /> Plantilla
          </Button>
          
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />} 
            Carga Masiva
          </Button>

          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo PDV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, código o ciudad..."
              className="pl-8 max-w-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredPDVs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No se encontraron puntos de venta.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPDVs.map((pdv) => (
                    <TableRow key={pdv.id}>
                      <TableCell className="font-medium">{pdv.codigo_interno}</TableCell>
                      <TableCell>{pdv.nombre}</TableCell>
                      <TableCell>{pdv.ciudad}</TableCell>
                      <TableCell className="text-sm">
                        {pdv.responsable_nombre ? (
                          <div className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full w-fit">
                            {pdv.responsable_nombre}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pdv.activo ? "default" : "secondary"}>
                          {pdv.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(pdv)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={pdv.activo ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}
                            onClick={() => handleToggleStatus(pdv)}
                          >
                            {pdv.activo ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PDVForm 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        pdvToEdit={selectedPDV}
        onSuccess={fetchPDVs}
      />
    </div>
  );
}