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
import { Loader2 } from "lucide-react";

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
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      nombre: "",
      codigo: "",
      activo: true,
    },
  });

  useEffect(() => {
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
  }, [categoryToEdit, form]);

  const onSubmit = async (values: CategoryFormValues) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (!profile?.tenant_id) throw new Error("Sin tenant asignado");

      const payload = {
        tenant_id: profile.tenant_id,
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

      toast({ title: "Éxito", description: "Categoría guardada correctamente" });
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
                  <FormDescription>Código corto para reportes</FormDescription>
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