import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

const categorySchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  codigo: z.string().optional(),
  activo: z.boolean().default(true),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryToEdit?: any;
  onSuccess: () => void;
}

export function CategoryForm({ open, onOpenChange, categoryToEdit, onSuccess }: CategoryFormProps) {
  const { toast } = useToast();
  const { tenantId, loading: loadingUser } = useCurrentUser(); // ✅ Usamos el hook seguro
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      nombre: "",
      codigo: "",
      activo: true,
    },
  });

  // Resetear formulario cuando se abre o cambia el modo edición
  useEffect(() => {
    if (open) {
      if (categoryToEdit) {
        form.reset({
          nombre: categoryToEdit.nombre,
          codigo: categoryToEdit.codigo || "",
          activo: categoryToEdit.activo,
        });
      } else {
        form.reset({
          nombre: "",
          codigo: "",
          activo: true,
        });
      }
    }
  }, [open, categoryToEdit, form]);

  const onSubmit = async (values: CategoryFormValues) => {
    if (!tenantId) {
      toast({ variant: "destructive", title: "Error Crítico", description: "No se ha identificado la organización (Tenant ID)." });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        tenant_id: tenantId, // ✅ Garantizado por el hook
        nombre: values.nombre,
        codigo: values.codigo ? values.codigo.toUpperCase() : null,
        activo: values.activo,
      };

      if (categoryToEdit) {
        const { error } = await supabase
          .from('inventory_categories')
          .update(payload)
          .eq('id', categoryToEdit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('inventory_categories')
          .insert(payload);
        if (error) throw error;
      }

      toast({ 
        title: "Operación Exitosa", 
        description: `Categoría ${categoryToEdit ? 'actualizada' : 'creada'} correctamente.` 
      });
      
      onSuccess(); // Recargar lista
      onOpenChange(false); // Cerrar modal
      form.reset(); // Limpiar campos
      
    } catch (error: any) {
      console.error(error);
      toast({ 
        variant: "destructive", 
        title: "Error al guardar", 
        description: error.message || "Ocurrió un error inesperado." 
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{categoryToEdit ? "Editar Categoría" : "Nueva Categoría"}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl><Input placeholder="Ej: Bebidas" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="codigo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código (Opcional)</FormLabel>
                  <FormControl><Input placeholder="Ej: BEB" {...field} className="uppercase" /></FormControl>
                  <FormDescription>Código corto para reportes e inventarios.</FormDescription>
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
                      <FormLabel>Activo</FormLabel>
                      <FormDescription>Disponible para productos</FormDescription>
                    </div>
                    <FormControl>
                      <input 
                        type="checkbox" 
                        checked={field.value} 
                        onChange={field.onChange}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving || loadingUser}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} 
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}