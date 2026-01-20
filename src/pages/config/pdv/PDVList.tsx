import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Plus, MapPin, Loader2, Edit, Power, PowerOff } from "lucide-react";
import { PDVForm } from "./PDVForm";
import { useToast } from "@/hooks/use-toast";

export default function PDVList() {
  const { toast } = useToast();
  const [pdvs, setPdvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPDV, setSelectedPDV] = useState<any>(null);

  const fetchPDVs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pdv')
      .select('*')
      .order('codigo_interno', { ascending: true });
    
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los PDVs" });
    } else {
      setPdvs(data || []);
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
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo PDV
        </Button>
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
                    <TableHead>Ubicación</TableHead>
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
                      <TableCell>
                        {pdv.latitud && pdv.longitud ? (
                          <div className="flex items-center text-green-600 text-xs">
                            <MapPin className="w-3 h-3 mr-1" />
                            GPS Configurado
                          </div>
                        ) : (
                          <div className="text-muted-foreground text-xs">Sin GPS</div>
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