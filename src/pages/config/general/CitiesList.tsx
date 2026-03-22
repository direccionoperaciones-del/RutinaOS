import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Edit2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export function CitiesList() {
  const { toast } = useToast();
  const { tenantId } = useCurrentUser();
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Form state
  const [nombre, setNombre] = useState("");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchCities = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .order('nombre');
    
    if (error) {
      // Si la tabla no existe aún o hay error, manejamos silenciosamente o mostramos toast
      console.error(error);
      // toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las ciudades." });
    } else {
      setCities(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (tenantId) fetchCities();
  }, [tenantId]);

  const handleOpenModal = (item: any = null) => {
    setEditingItem(item);
    if (item) {
      setNombre(item.nombre);
      setActivo(item.activo);
    } else {
      setNombre("");
      setActivo(true);
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!nombre) {
      toast({ variant: "destructive", title: "Requerido", description: "El nombre es obligatorio." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        nombre,
        activo
      };

      if (editingItem) {
        await supabase.from('cities').update(payload).eq('id', editingItem.id);
      } else {
        await supabase.from('cities').insert(payload);
      }

      toast({ title: "Guardado", description: "Ciudad actualizada correctamente." });
      setIsModalOpen(false);
      fetchCities();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar esta ciudad?")) return;
    
    const { error } = await supabase.from('cities').delete().eq('id', id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se puede eliminar (posiblemente en uso)." });
    } else {
      fetchCities();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Ciudades Operativas</h3>
          <p className="text-sm text-muted-foreground">Define las ciudades donde tienes operación.</p>
        </div>
        <Button onClick={() => handleOpenModal()} size="sm">
          <Plus className="w-4 h-4 mr-2" /> Nueva Ciudad
        </Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={3} className="text-center">Cargando...</TableCell></TableRow>
            ) : cities.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No hay ciudades registradas.</TableCell></TableRow>
            ) : (
              cities.map((city) => (
                <TableRow key={city.id}>
                  <TableCell className="font-medium">{city.nombre}</TableCell>
                  <TableCell>
                    {city.activo ? (
                      <span className="text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded-full">Activo</span>
                    ) : (
                      <span className="text-gray-500 text-xs font-medium bg-gray-100 px-2 py-1 rounded-full">Inactivo</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(city)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(city.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar Ciudad" : "Nueva Ciudad"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre de la Ciudad</Label>
              <Input placeholder="Ej: Bogotá D.C." value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="flex items-center justify-between border p-3 rounded-md">
              <Label>Activo</Label>
              <Switch checked={activo} onCheckedChange={setActivo} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}