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
import { MapPin, User, Building, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<PDVFormValues>({
    resolver: zodResolver(pdvSchema),
    defaultValues: {
      nombre: "",
      codigo_interno: "",
      ciudad: "",
      direccion: "",
      telefono: "",
      latitud: null,
      longitud: null,
      radio_gps: 100,
      activo: true,
      responsable_id: "sin_asignar"
    },
  });

  // Cargar usuarios para el selector
  useEffect(() => {
    if (open) {
      const fetchUsers = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('id, nombre, apellido, role')
          .eq('activo', true)
          .order('nombre');
        if (data) setUsers(data);
      };
      fetchUsers();
    }
  }, [open]);

  // Cargar datos al editar (incluyendo responsable actual)
  useEffect(() => {
    const loadPDVData = async () => {
      if (pdvToEdit) {
        // Buscar responsable vigente
        const { data: assignment } = await supabase
          .from('pdv_assignments')
          .select('user_id')
          .eq('pdv_id', pdvToEdit.id)
          .eq('vigente', true)
          .maybeSingle();

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
          responsable_id: assignment?.user_id || "sin_asignar"
        });
      } else {
        form.reset({
          nombre: "",
          codigo_interno: "",
          ciudad: "",
          direccion: "",
          telefono: "",
          latitud: null,
          longitud: null,
          radio_gps: 100,
          activo: true,
          responsable_id: "sin_asignar"
        });
      }
    };

    if (open) {
      loadPDVData();
    }
  }, [pdvToEdit, open]); // form excluido para evitar re-renders innecesarios

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "Error", description: "Geolocalización no soportada" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.setValue("latitud", pos.coords.latitude);
        form.setValue("longitud", pos.coords.longitude);
        toast({ title: "Ubicación obtenida", description: "Coordenadas actualizadas." });
      },
      (err) => {
        toast({ variant: "destructive", title: "Error", description: "No se pudo obtener la ubicación." });
      }
    );
  };

  const onSubmit = async (values: PDVFormValues) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Obtener tenant del usuario actual
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();
      
      if (!profile?.tenant_id) {
        throw new Error("Sin organización asignada.");
      }

      const pdvData = {
        tenant_id: profile.tenant_id,
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
        // Update
        const { error } = await supabase
          .from('pdv')
          .update(pdvData)
          .eq('id', pdvToEdit.id);
        if (error) throw error;
      } else {
        // Insert
        const { data, error } = await supabase
          .from('pdv')
          .insert(pdvData)
          .select()
          .single();
        if (error) throw error;
        pdvId = data.id;
      }

      // --- MANEJO INTELIGENTE DE RESPONSABLE ---
      const newResponsableId = values.responsable_id;
      
      // 1. Verificar asignación actual
      const { data: currentAssignment } = await supabase
        .from('pdv_assignments')
        .select('id, user_id')
        .eq('pdv_id', pdvId)
        .eq('vigente', true)
        .maybeSingle();
      
      const oldUserId = currentAssignment?.user_id || "sin_asignar";

      // 2. Si hubo cambio
      if (newResponsableId !== oldUserId) {
        // A. Cerrar asignación anterior (si existe)
        if (currentAssignment) {
          await supabase
            .from('pdv_assignments')
            .update({ 
              vigente: false, 
              fecha_hasta: new Date().toISOString().split('T')[0] 
            })
            .eq('id', currentAssignment.id);
        }

        // B. Crear nueva asignación (si se seleccionó un usuario válido)
        if (newResponsableId && newResponsableId !== "sin_asignar") {
          const { error: assignError } = await supabase.from('pdv_assignments').insert({
            tenant_id: profile.tenant_id,
            pdv_id: pdvId,
            user_id: newResponsableId,
            vigente: true,
            created_by: user.id
          });
          
          if (assignError) throw assignError;
        }
      }

      toast({ title: "Éxito", description: `PDV ${pdvToEdit ? 'actualizado' : 'creado'} correctamente.` });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: error.message || "Error al guardar PDV" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{pdvToEdit ? "Editar PDV" : "Crear Nuevo PDV"}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general"><Building className="w-4 h-4 mr-2"/> General</TabsTrigger>
                <TabsTrigger value="geo"><MapPin className="w-4 h-4 mr-2"/> Ubicación</TabsTrigger>
                <TabsTrigger value="responsable"><User className="w-4 h-4 mr-2"/> Responsable</TabsTrigger>
              </TabsList>

              <div className="py-4">
                {/* TAB GENERAL */}
                <TabsContent value="general" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="codigo_interno"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Código *</FormLabel>
                          <FormControl><Input placeholder="Ej: 001" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ciudad"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ciudad *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Bogotá">Bogotá</SelectItem>
                              <SelectItem value="Medellín">Medellín</SelectItem>
                              <SelectItem value="Cali">Cali</SelectItem>
                              <SelectItem value="Barranquilla">Barranquilla</SelectItem>
                              <SelectItem value="Cartagena">Cartagena</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="nombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre PDV *</FormLabel>
                        <FormControl><Input placeholder="Ej: PDV Centro Comercial" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="direccion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dirección</FormLabel>
                        <FormControl><Input placeholder="Av. Principal #123" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="telefono"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono</FormLabel>
                        <FormControl><Input placeholder="(601) 123 4567" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="activo"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Estado Activo</FormLabel>
                          <FormDescription>PDV disponible para operaciones</FormDescription>
                        </div>
                        <FormControl>
                          <input 
                            type="checkbox" 
                            checked={field.value} 
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* TAB GEO */}
                <TabsContent value="geo" className="space-y-4">
                  <div className="bg-muted p-4 rounded-md text-sm text-muted-foreground mb-4">
                    Las coordenadas son obligatorias si asignas rutinas con validación GPS.
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="latitud"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Latitud</FormLabel>
                          <FormControl><Input type="number" step="any" {...field} value={field.value || ''} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="longitud"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Longitud</FormLabel>
                          <FormControl><Input type="number" step="any" {...field} value={field.value || ''} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button type="button" variant="secondary" className="w-full" onClick={getCurrentLocation}>
                    <MapPin className="w-4 h-4 mr-2" /> Obtener mi ubicación actual
                  </Button>
                  <FormField
                    control={form.control}
                    name="radio_gps"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Radio de Tolerancia (Metros)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormDescription>Rango permitido para realizar tareas (10-1000m)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* TAB RESPONSABLE */}
                <TabsContent value="responsable" className="space-y-4">
                  <FormField
                    control={form.control}
                    name="responsable_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responsable Principal</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccione un usuario" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="sin_asignar">Sin asignar</SelectItem>
                            {users.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.nombre} {user.apellido} ({user.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          El usuario seleccionado será el encargado principal del PDV.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {pdvToEdit && (
                    <div className="bg-yellow-50 p-3 rounded text-xs text-yellow-800 border border-yellow-200">
                      Nota: Al cambiar el responsable, se cerrará la asignación anterior y se creará una nueva automáticamente.
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {pdvToEdit ? "Guardar Cambios" : "Crear PDV"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}