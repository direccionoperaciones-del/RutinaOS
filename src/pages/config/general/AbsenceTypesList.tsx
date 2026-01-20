import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Edit2, CalendarOff } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export function AbsenceTypesList() {
  const { toast } = useToast();
  const { tenantId } = useCurrentUser();
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Form state
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchTypes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('absence_types')
      .select('*')
      .order('nombre');
    
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los tipos de novedad." });
    } else {
      setTypes(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (tenantId) fetchTypes();
  }, [tenantId]);

  const handleOpenModal = (item: any = null) => {
    setEditingItem(item);
    if (item) {
      setNombre(item.nombre);
      setCodigo(item.codigo);
      setActivo(item.activo);
    } else {
      setNombre("");
      setCodigo("");
      setActivo(true);
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!nombre || !codigo) {
      toast({ variant: "destructive", title: "Campos requeridos", description: "Nombre y Código son obligatorios." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        nombre,
        codigo: codigo.toUpperCase(),
        activo
      };

      if (editingItem) {
        await supabase.from('absence_types').update(payload).eq('id', editingItem.id);
      } else {
        await supabase.from('absence_types').insert(payload);
      }

      toast({ title: "Guardado", description: "Tipo de novedad actualizado correctamente." });
      setIsModalOpen(false);
      fetchTypes();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar este tipo?")) return;
    
    const { error } = await supabase.from('absence_types').delete().eq('id', id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se puede eliminar (posiblemente en uso)." });
    } else {
      fetchTypes();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Tipos de Novedades</h3>
          <p className="text-sm text-muted-foreground">Configura los motivos de ausencia (Vacaciones, Incapacidad, etc).</p>
        </div>
        <Button onClick={() => handleOpenModal()} size="sm">
          <Plus className="w-4 h-4 mr-2" /> Nuevo Tipo
        </Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Código Interno</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center">Cargando...</TableCell></TableRow>
            ) : types.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No hay tipos registrados.</TableCell></TableRow>
            ) : (
              types.map((type) => (
                <TableRow key={type.id}>
                  <TableCell className="font-medium">{type.nombre}</TableCell>
                  <TableCell><span className="font-mono bg-muted px-2 py-1 rounded text-xs">{type.codigo}</span></TableCell>
                  <TableCell>
                    {type.activo ? (
                      <span className="text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded-full">Activo</span>
                    ) : (
                      <span className="text-gray-500 text-xs font-medium bg-gray-100 px-2 py-1 rounded-full">Inactivo</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(type)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(type.id)}>
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
            <DialogTitle>{editingItem ? "Editar Tipo" : "Nuevo Tipo de Novedad"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input placeholder="Ej: Licencia de Maternidad" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Código</Label>
              <Input placeholder="Ej: MAT" value={codigo} onChange={(e) => setCodigo(e.target.value)} className="uppercase" />
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