import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Edit2, Scale } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export function MeasurementUnitsList() {
  const { toast } = useToast();
  const { tenantId } = useCurrentUser();
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Form state
  const [nombre, setNombre] = useState("");
  const [simbolo, setSimbolo] = useState("");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchUnits = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('measurement_units')
      .select('*')
      .order('nombre');
    
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las unidades." });
    } else {
      setUnits(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (tenantId) fetchUnits();
  }, [tenantId]);

  const handleOpenModal = (item: any = null) => {
    setEditingItem(item);
    if (item) {
      setNombre(item.nombre);
      setSimbolo(item.simbolo);
      setActivo(item.activo);
    } else {
      setNombre("");
      setSimbolo("");
      setActivo(true);
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!nombre || !simbolo) {
      toast({ variant: "destructive", title: "Campos requeridos", description: "Nombre y Símbolo son obligatorios." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        nombre,
        simbolo,
        activo
      };

      if (editingItem) {
        await supabase.from('measurement_units').update(payload).eq('id', editingItem.id);
      } else {
        await supabase.from('measurement_units').insert(payload);
      }

      toast({ title: "Guardado", description: "Unidad de medida actualizada correctamente." });
      setIsModalOpen(false);
      fetchUnits();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar esta unidad?")) return;
    
    const { error } = await supabase.from('measurement_units').delete().eq('id', id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se puede eliminar (posiblemente en uso)." });
    } else {
      fetchUnits();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Unidades de Medida</h3>
          <p className="text-sm text-muted-foreground">Define las unidades disponibles para el inventario (Kg, L, Und, etc).</p>
        </div>
        <Button onClick={() => handleOpenModal()} size="sm">
          <Plus className="w-4 h-4 mr-2" /> Nueva Unidad
        </Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Símbolo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center">Cargando...</TableCell></TableRow>
            ) : units.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No hay unidades registradas.</TableCell></TableRow>
            ) : (
              units.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell className="font-medium">{unit.nombre}</TableCell>
                  <TableCell><span className="font-mono bg-muted px-2 py-1 rounded text-xs">{unit.simbolo}</span></TableCell>
                  <TableCell>
                    {unit.activo ? (
                      <span className="text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded-full">Activo</span>
                    ) : (
                      <span className="text-gray-500 text-xs font-medium bg-gray-100 px-2 py-1 rounded-full">Inactivo</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(unit)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(unit.id)}>
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
            <DialogTitle>{editingItem ? "Editar Unidad" : "Nueva Unidad de Medida"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input placeholder="Ej: Kilogramo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Símbolo / Abreviatura</Label>
              <Input placeholder="Ej: Kg" value={simbolo} onChange={(e) => setSimbolo(e.target.value)} />
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