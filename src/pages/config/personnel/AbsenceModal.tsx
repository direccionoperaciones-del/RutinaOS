import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const absenceSchema = z.object({
  user_id: z.string().min(1, "Usuario requerido"),
  tipo_ausencia_id: z.string().min(1, "Tipo requerido"),
  fecha_desde: z.string().min(1, "Fecha inicio requerida"),
  fecha_hasta: z.string().min(1, "Fecha fin requerida"),
  politica: z.enum(["omitir", "reasignar"]),
  receptor_id: z.string().optional(),
  notas: z.string().optional(),
}).refine(data => {
  if (data.politica === 'reasignar' && !data.receptor_id) {
    return false;
  }
  return true;
}, {
  message: "Debe seleccionar un receptor si la política es reasignar",
  path: ["receptor_id"]
});

type AbsenceFormValues = z.infer<typeof absenceSchema>;

interface AbsenceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preselectedUserId?: string;
  absenceToEdit?: any; // Prop para modo edición
}

export function AbsenceModal({ open, onOpenChange, onSuccess, preselectedUserId, absenceToEdit }: AbsenceModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [absenceTypes, setAbsenceTypes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const form = useForm<AbsenceFormValues>({
    resolver: zodResolver(absenceSchema),
    defaultValues: {
      user_id: "",
      tipo_ausencia_id: "",
      fecha_desde: "",
      fecha_hasta: "",
      politica: "omitir",
      receptor_id: "",
      notas: ""
    },
  });

  const politica = form.watch("politica");
  const selectedUser = form.watch("user_id");

  useEffect(() => {
    if (open) {
      loadData();
      
      if (absenceToEdit) {
        // Cargar datos existentes
        form.reset({
          user_id: absenceToEdit.user_id,
          tipo_ausencia_id: absenceToEdit.tipo_ausencia_id,
          fecha_desde: absenceToEdit.fecha_desde,
          fecha_hasta: absenceToEdit.fecha_hasta,
          politica: absenceToEdit.politica,
          receptor_id: absenceToEdit.receptor_id || "",
          notas: absenceToEdit.notas || ""
        });
      } else {
        // Reset para nuevo registro
        form.reset({
          user_id: preselectedUserId || "",
          tipo_ausencia_id: "",
          fecha_desde: "",
          fecha_hasta: "",
          politica: "omitir",
          receptor_id: "",
          notas: ""
        });
      }
    }
  }, [open, preselectedUserId, absenceToEdit]);

  const loadData = async () => {
    const { data: userData } = await supabase
      .from('profiles')
      .select('id, nombre, apellido, role')
      .eq('activo', true);
    if (userData) setUsers(userData);

    const { data: typesData } = await supabase
      .from('absence_types')
      .select('*')
      .eq('activo', true);
    
    if (!typesData || typesData.length === 0) {
       // Fallback creation logic handled elsewhere or manually
    } else {
      setAbsenceTypes(typesData);
    }
  };

  const onSubmit = async (values: AbsenceFormValues) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const payload = {
        user_id: values.user_id,
        tipo_ausencia_id: values.tipo_ausencia_id,
        fecha_desde: values.fecha_desde,
        fecha_hasta: values.fecha_hasta,
        politica: values.politica,
        receptor_id: values.politica === 'reasignar' ? values.receptor_id : null,
        notas: values.notas,
      };

      if (absenceToEdit) {
        // Update
        const { error } = await supabase
          .from('user_absences')
          .update(payload)
          .eq('id', absenceToEdit.id);
        
        if (error) throw error;
      } else {
        // Insert
        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user?.id).single();
        const { error } = await supabase
          .from('user_absences')
          .insert({
            ...payload,
            tenant_id: profile?.tenant_id,
            created_by: user?.id
          });
        
        if (error) throw error;
      }

      toast({ 
        title: "Éxito", 
        description: `Novedad ${absenceToEdit ? 'actualizada' : 'registrada'} correctamente.` 
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{absenceToEdit ? "Editar Novedad" : "Registrar Ausencia / Novedad"}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            <FormField
              control={form.control}
              name="user_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usuario</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!!preselectedUserId}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccione usuario" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nombre} {u.apellido} ({u.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo_ausencia_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {absenceTypes.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="politica"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Acción Tareas</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="omitir">Omitir (No generar)</SelectItem>
                        <SelectItem value="reasignar">Reasignar</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fecha_desde"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desde</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fecha_hasta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hasta</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {politica === 'reasignar' && (
              <div className="p-3 bg-blue-50 rounded border border-blue-100">
                <FormField
                  control={form.control}
                  name="receptor_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reasignar tareas a:</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccione reemplazo" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {users
                            .filter(u => u.id !== selectedUser)
                            .map(u => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.nombre} {u.apellido} ({u.role})
                              </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        Este usuario recibirá las tareas generadas durante el periodo.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Detalles adicionales..." {...field} className="h-20 resize-none" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}