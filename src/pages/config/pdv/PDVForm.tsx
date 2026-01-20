import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, User, Building, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";

const pdvSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  codigo_interno: z.string().min(1, "El código es obligatorio"),
  ciudad: z.string().min(1, "La ciudad es obligatoria"),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  latitud: z.coerce.number().optional().nullable(),
  longitud: z.coerce.number().optional().nullable(),
  radio_gps: z.coerce.number().min(10).max(1000).default(100),
  activo: z.boolean().default(true),
  responsable_id: z.string().optional(), 
});

type PDVFormValues = z.infer<typeof pdvSchema>;

interface PDVFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdvToEdit?: any;
  onSuccess: () => void;
}

export function PDVForm({ open, onOpenChange, pdvToEdit, onSuccess }: PDVFormProps) {
  const { toast } = useToast();
  const { tenantId, user, loading: loadingUser } = useCurrentUser();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<PDVFormValues>({
    resolver: zodResolver(pdvSchema),
    defaultValues: {
      nombre: "", codigo_interno: "", ciudad: "", direccion: "", telefono: "",
      latitud: null, longitud: null, radio_gps: 100, activo: true, responsable_id: "sin_asignar"
    },
  });

  // Cargar usuarios
  useEffect(() => {
    if (open && tenantId) {
      const fetchUsers = async () => {
        const { data } = await supabase.from('profiles').select('id, nombre, apellido, role').eq('activo', true).eq('tenant_id', tenantId);
        if (data) setUsers(data);
      };
      fetchUsers();
    }
  }, [open, tenantId]);

  // Cargar datos al editar
  useEffect(() => {
    if (pdvToEdit) {
      form.reset({
        nombre: pdvToEdit.nombre,
        codigo_interno: pdvToEdit.codigo_interno,
        ciudad: pdvToEdit.ciudad,
        direccion: pdvToEdit.direccion || "",
        telefono: pdvToEdit.telefono || "",
        latitud: pdvToEdit.latitud,
        longitud: pdvToEdit.longitud,
        radio_gps: pdvToEdit.radio_gps || 100,
        activo: pdvToEdit.activo,
        responsable_id: "sin_asignar" // La asignación se maneja aparte o se carga aquí si es necesario
      });
    } else {
      form.reset({
        nombre: "", codigo_interno: "", ciudad: "", direccion: "", telefono: "",
        latitud: null, longitud: null, radio_gps: 100, activo: true, responsable_id: "sin_asignar"
      });
    }
  }, [pdvToEdit, form]);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) return toast({ variant: "destructive", title: "Error", description: "Geolocalización no soportada" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.setValue("latitud", pos.coords.latitude);
        form.setValue("longitud", pos.coords.longitude);
        toast({ title: "Ubicación obtenida", description: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}` });
      },
      (err) => toast({ variant: "destructive", title: "Error", description: "No se pudo obtener ubicación." })
    );
  };

  const onSubmit = async (values: PDVFormValues) => {
    if (!tenantId || !user) {
      return toast({ variant: "destructive", title: "Error Crítico", description: "No se identificó la organización (Tenant Missing)." });
    }

    setIsLoading(true);
    try {
      const pdvData = {
        tenant_id: tenantId,
        nombre: values.nombre,
        codigo_interno: values.codigo_interno,
        ciudad: values.ciudad,
        direccion: values.direccion,
        telefono: values.telefono,
        latitud: values.latitud,
        longitud: values.longitud,
        radio_gps: values.radio_gps,
        activo: values.activo,
      };

      let pdvId = pdvToEdit?.id;

      if (pdvToEdit) {
        const { error } = await supabase.from('pdv').update(pdvData).eq('id', pdvToEdit.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('pdv').insert(pdvData).select().single();
        if (error) throw error;
        pdvId = data.id;
      }

      // Asignar responsable si se seleccionó
      if (values.responsable_id && values.responsable_id !== "sin_asignar") {
        await supabase.from('pdv_assignments').insert({
          tenant_id: tenantId,
          pdv_id: pdvId,
          user_id: values.responsable_id,
          vigente: true,
          created_by: user.id
        });
      }

      toast({ title: "Éxito", description: `PDV ${pdvToEdit ? 'actualizado' : 'creado'} correctamente.` });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error al guardar", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{pdvToEdit ? "Editar PDV" : "Crear Nuevo PDV"}</DialogTitle></DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="geo">Ubicación</TabsTrigger>
                <TabsTrigger value="responsable">Responsable</TabsTrigger>
              </TabsList>

              <div className="py-4">
                <TabsContent value="general" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="codigo_interno" render={({ field }) => (
                      <FormItem><FormLabel>Código *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="ciudad" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ciudad *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="Bogotá">Bogotá</SelectItem><SelectItem value="Medellín">Medellín</SelectItem><SelectItem value="Cali">Cali</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="nombre" render={({ field }) => (
                    <FormItem><FormLabel>Nombre PDV *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                   <FormField control={form.control} name="activo" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 mt-2">
                      <FormControl><input type="checkbox" checked={field.value} onChange={field.onChange} className="h-4 w-4 accent-primary" /></FormControl>
                      <FormLabel className="font-normal">PDV Activo</FormLabel>
                    </FormItem>
                  )} />
                </TabsContent>

                <TabsContent value="geo" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="latitud" render={({ field }) => (
                      <FormItem><FormLabel>Latitud</FormLabel><FormControl><Input type="number" step="any" {...field} value={field.value || ''}/></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="longitud" render={({ field }) => (
                      <FormItem><FormLabel>Longitud</FormLabel><FormControl><Input type="number" step="any" {...field} value={field.value || ''}/></FormControl></FormItem>
                    )} />
                  </div>
                  <Button type="button" variant="secondary" size="sm" className="w-full" onClick={getCurrentLocation}><MapPin className="w-4 h-4 mr-2"/> Detectar Ubicación</Button>
                </TabsContent>

                <TabsContent value="responsable" className="space-y-4">
                  <FormField control={form.control} name="responsable_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsable Principal</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="sin_asignar">Sin asignar</SelectItem>
                          {users.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre} {u.apellido}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading || loadingUser}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}