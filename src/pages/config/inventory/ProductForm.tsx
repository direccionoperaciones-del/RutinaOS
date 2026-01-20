import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// ✅ SKU y Unidad ahora son obligatorios
const productSchema = z.object({
  categoria_id: z.string().min(1, "La categoría es obligatoria"),
  nombre: z.string().min(1, "El nombre es obligatorio"),
  codigo_sku: z.string().min(1, "El SKU es obligatorio"),
  unidad: z.string().min(1, "La unidad de medida es obligatoria"),
  activo: z.boolean().default(true),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productToEdit?: any;
  onSuccess: () => void;
}

export function ProductForm({ open, onOpenChange, productToEdit, onSuccess }: ProductFormProps) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]); // ✅ State for units
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      categoria_id: "",
      nombre: "",
      codigo_sku: "",
      unidad: "",
      activo: true,
    },
  });

  useEffect(() => {
    const fetchData = async () => {
      // Fetch categories
      const { data: catData } = await supabase.from('inventory_categories').select('*').eq('activo', true);
      if (catData) setCategories(catData);

      // ✅ Fetch units
      const { data: unitsData } = await supabase.from('measurement_units').select('*').eq('activo', true);
      if (unitsData) setUnits(unitsData);
    };
    if (open) fetchData();
  }, [open]);

  useEffect(() => {
    if (productToEdit) {
      form.reset({
        categoria_id: productToEdit.categoria_id,
        nombre: productToEdit.nombre,
        codigo_sku: productToEdit.codigo_sku || "",
        unidad: productToEdit.unidad || "",
        activo: productToEdit.activo,
      });
    } else {
      form.reset({
        categoria_id: "",
        nombre: "",
        codigo_sku: "",
        unidad: "",
        activo: true,
      });
    }
  }, [productToEdit, form, open]);

  const onSubmit = async (values: ProductFormValues) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (!profile?.tenant_id) throw new Error("Sin tenant asignado");

      const payload = {
        tenant_id: profile.tenant_id,
        categoria_id: values.categoria_id,
        nombre: values.nombre,
        codigo_sku: values.codigo_sku,
        unidad: values.unidad,
        activo: values.activo,
      };

      if (productToEdit) {
        const { error } = await supabase.from('inventory_products').update(payload).eq('id', productToEdit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('inventory_products').insert(payload);
        if (error) throw error;
      }

      toast({ title: "Éxito", description: "Producto guardado correctamente" });
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
          <DialogTitle>{productToEdit ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="categoria_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.nombre}</SelectItem>
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
                name="codigo_sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU *</FormLabel>
                    <FormControl><Input placeholder="SKU-123" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="unidad"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidad *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units.length > 0 ? units.map((u) => (
                          <SelectItem key={u.id} value={u.simbolo}>{u.nombre} ({u.simbolo})</SelectItem>
                        )) : (
                          <SelectItem value="temp" disabled>No hay unidades configuradas</SelectItem>
                        )}
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
                  <FormLabel>Nombre Producto *</FormLabel>
                  <FormControl><Input placeholder="Ej: Coca Cola 1.5L" {...field} /></FormControl>
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