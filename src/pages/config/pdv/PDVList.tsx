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
  const [isDownloading, setIsDownloading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPDV, setSelectedPDV] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPDVs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pdv')
      .select(`*, pdv_assignments(profiles(nombre, apellido))`)
      .order('codigo_interno', { ascending: true });
      
    // Fallback simple si el join falla
    const { data: simpleData, error: simpleError } = await supabase
      .from('pdv')
      .select('*')
      .order('codigo_interno', { ascending: true });
    
    if (simpleError) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los PDVs" });
    } else {
      setPdvs(simpleData || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchPDVs(); }, []);

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
    const { error } = await supabase.from('pdv').update({ activo: newStatus }).eq('id', pdv.id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el estado" });
    } else {
      toast({ title: "Estado actualizado", description: `PDV ${newStatus ? 'activado' : 'desactivado'}` });
      fetchPDVs();
    }
  };

  // --- LOGICA DE PLANTILLA Y CARGA MASIVA ---
  const downloadTemplate = async () => {
    setIsDownloading(true);
    try {
      toast({ title: "Generando plantilla...", description: "Consultando usuarios activos..." });
      const { data: users } = await supabase.from('profiles').select('nombre, apellido, role').eq('activo', true).order('nombre');
      const headers = ["codigo_interno", "nombre", "ciudad", "direccion", "telefono", "latitud", "longitud", "radio_gps", "responsable", "", "USUARIO_REFERENCIA (COPIAR)", "ROL_REFERENCIA"];
      const rows = [];
      const firstUser = users && users.length > 0 ? `${users[0].nombre} ${users[0].apellido}` : "Juan Perez";
      const examplePdv = ["PDV-001", "Tienda Central", "Bogotá", "Calle 123 #45-67", "3001234567", "4.6097", "-74.0817", "100", firstUser];
      const u1 = users && users.length > 0 ? users[0] : null;
      const refData1 = u1 ? ["", `${u1.nombre} ${u1.apellido}`, u1.role] : ["", "Sin usuarios", "-"];
      rows.push([...examplePdv, ...refData1].join(";"));
      if (users && users.length > 1) {
        for (let i = 1; i < users.length; i++) {
          const u = users[i];
          const emptyPdv = ["", "", "", "", "", "", "", "", ""]; 
          const refData = ["", `${u.nombre} ${u.apellido}`, u.role];
          rows.push([...emptyPdv, ...refData].join(";"));
        }
      }
      const bom = "\uFEFF"; 
      const csvContent = bom + headers.join(";") + "\n" + rows.join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'plantilla_pdv_con_usuarios.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Plantilla descargada", description: "Revisa las columnas K y L para ver los usuarios válidos." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo generar la plantilla." });
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
      if (!text) return;
      try { await processBatch(text); } catch (error: any) { toast({ variant: "destructive", title: "Error en carga", description: error.message }); } finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    };
    reader.readAsText(file);
  };

  const processBatch = async (csvText: string) => {
    const lines = csvText.split(/\r?\n/);
    const rows = lines.slice(1).filter(line => line.trim() !== '');
    if (rows.length === 0) throw new Error("El archivo está vacío o solo tiene encabezados");
    const separator = lines[0].includes(';') ? ';' : ',';
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");
    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
    if (!profile?.tenant_id) throw new Error("Sin organización asignada");
    const { data: users } = await supabase.from('profiles').select('id, nombre, apellido').eq('activo', true);
    const userMap = new Map(); 
    users?.forEach(u => {
      const key = `${u.nombre}${u.apellido}`.toLowerCase().replace(/\s+/g, '');
      userMap.set(key, u.id);
      const keySpaced = `${u.nombre} ${u.apellido}`.toLowerCase().trim();
      userMap.set(keySpaced, u.id);
    });
    let successCount = 0;
    let errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cols = row.split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
      if (!cols[0]) continue;
      const codigo = cols[0];
      const nombre = cols[1];
      const ciudad = cols[2];
      const direccion = cols[3];
      const telefono = cols[4];
      const lat = cols[5];
      const lng = cols[6];
      const radio = cols[7];
      const responsableName = cols[8];
      if (!nombre || !ciudad) { errors.push(`Fila ${i + 2}: Faltan campos obligatorios (Nombre o Ciudad) para el código ${codigo}.`); continue; }
      try {
        const latVal = lat ? parseFloat(lat.replace(',', '.')) : null;
        const lngVal = lng ? parseFloat(lng.replace(',', '.')) : null;
        const radioVal = radio ? parseInt(radio) : 100;
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
        if (pdvError) throw pdvError;
        if (responsableName && newPdv) {
          const searchKey = responsableName.toLowerCase().replace(/\s+/g, '');
          const userId = userMap.get(searchKey) || userMap.get(responsableName.toLowerCase().trim());
          if (userId) {
            await supabase.from('pdv_assignments').insert({
              tenant_id: profile.tenant_id,
              pdv_id: newPdv.id,
              user_id: userId,
              vigente: true,
              created_by: user.id
            });
          } else { errors.push(`Fila ${i + 2}: PDV creado, pero el usuario "${responsableName}" no coincide.`); }
        }
        successCount++;
      } catch (err: any) {
        let msg = err.message;
        if (err.code === '23505') msg = "El código interno o nombre ya existe.";
        errors.push(`Fila ${i + 2} (${codigo}): ${msg}`);
      }
    }
    fetchPDVs();
    if (errors.length > 0) {
      toast({ variant: "default", title: "Carga completada con observaciones", description: `Creados: ${successCount}. Errores: ${errors.length}.` });
      alert(`Reporte de Carga:\n\nSe crearon ${successCount} PDVs.\n\nErrores encontrados:\n${errors.join('\n')}`);
    } else if (successCount > 0) {
      toast({ title: "Carga Exitosa", description: `Se crearon ${successCount} puntos de venta.` });
    } else {
      toast({ variant: "destructive", title: "Sin datos", description: "No se encontraron registros válidos." });
    }
  };

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
          <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={handleFileUpload} />
          <Button variant="outline" onClick={downloadTemplate} disabled={isDownloading} title="Descargar plantilla">
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />} Plantilla
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />} Carga Masiva
          </Button>
          <Button onClick={handleCreate}><Plus className="w-4 h-4 mr-2" /> Nuevo PDV</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, código o ciudad..." className="pl-8 max-w-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : filteredPDVs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No se encontraron puntos de venta.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPDVs.map((pdv) => (
                    <TableRow key={pdv.id}>
                      <TableCell className="font-medium">{pdv.codigo_interno}</TableCell>
                      <TableCell className="whitespace-nowrap">{pdv.nombre}</TableCell>
                      <TableCell>{pdv.ciudad}</TableCell>
                      <TableCell>
                        {pdv.latitud && pdv.longitud ? (
                          <div className="flex items-center text-green-600 text-xs"><MapPin className="w-3 h-3 mr-1" /> GPS Configurado</div>
                        ) : (
                          <div className="text-muted-foreground text-xs">Sin GPS</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pdv.activo ? "default" : "secondary"}>{pdv.activo ? "Activo" : "Inactivo"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(pdv)}><Edit className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className={pdv.activo ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"} onClick={() => handleToggleStatus(pdv)}>
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

      <PDVForm open={isModalOpen} onOpenChange={setIsModalOpen} pdvToEdit={selectedPDV} onSuccess={fetchPDVs} />
    </div>
  );
}