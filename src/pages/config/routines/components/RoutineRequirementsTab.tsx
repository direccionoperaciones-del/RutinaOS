import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect } from "@/components/ui/multi-select"; // Asumiendo que existe o usaremos un select múltiple nativo
import { RoutineFormValues } from "../routine-schema";
import { Loader2 } from "lucide-react";

// Componente simple de MultiSelect si no tienes uno en UI kit
const SimpleMultiSelect = ({ options, value, onChange }: any) => {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {options.map((opt: any) => (
        <div key={opt.value} className="flex items-center space-x-2 border p-2 rounded bg-background">
          <Checkbox 
            id={`cat-${opt.value}`}
            checked={value.includes(opt.value)}
            onCheckedChange={(checked) => {
              if (checked) onChange([...value, opt.value]);
              else onChange(value.filter((v: string) => v !== opt.value));
            }}
          />
          <label htmlFor={`cat-${opt.value}`} className="text-sm cursor-pointer w-full">
            {opt.label}
          </label>
        </div>
      ))}
    </div>
  );
};

interface RoutineRequirementsTabProps {
  form: UseFormReturn<RoutineFormValues>;
}

export function RoutineRequirementsTab({ form }: RoutineRequirementsTabProps) {
  const [categories, setCategories] = useState<{label: string, value: string}[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);

  const watchFotos = form.watch("fotos_obligatorias");
  const watchInventario = form.watch("requiere_inventario");

  useEffect(() => {
    const fetchCats = async () => {
      setLoadingCats(true);
      const { data } = await supabase
        .from('inventory_categories')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      
      if (data) {
        setCategories(data.map(c => ({ label: c.nombre, value: c.id })));
      }
      setLoadingCats(false);
    };
    fetchCats();
  }, []);

  return (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-1 gap-4 border p-4 rounded-md">
        
        {/* GPS */}
        <FormField
          control={form.control}
          name="gps_obligatorio"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Validación GPS Obligatoria</FormLabel>
                <FormDescription>
                  El usuario debe estar dentro del radio del PDV para completar la tarea.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        
        {/* FOTOS */}
        <div className="border-t pt-4 mt-2">
          <FormField
            control={form.control}
            name="fotos_obligatorias"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 mb-4">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Requiere Evidencia Fotográfica</FormLabel>
                </div>
              </FormItem>
            )}
          />
          
          {watchFotos && (
            <FormField
              control={form.control}
              name="min_fotos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mínimo de fotos requeridas</FormLabel>
                  <FormControl><Input type="number" min="1" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {/* INVENTARIO */}
        <div className="border-t pt-4 mt-2 bg-orange-50/30 p-3 rounded">
          <FormField
            control={form.control}
            name="requiere_inventario"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="text-orange-900">Incluye Toma de Inventario</FormLabel>
                  <FormDescription>
                    Se pedirá contar productos asociados.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {watchInventario && (
            <div className="mt-4 ml-7">
              <FormField
                control={form.control}
                name="categorias_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seleccionar Categorías a Inventariar</FormLabel>
                    {loadingCats ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" /> Cargando categorías...
                      </div>
                    ) : (
                      <SimpleMultiSelect 
                        options={categories}
                        value={field.value || []}
                        onChange={field.onChange}
                      />
                    )}
                    <FormDescription>
                      Solo se mostrarán productos de estas categorías.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        {/* COMENTARIO */}
        <div className="border-t pt-4 mt-2">
          <FormField
            control={form.control}
            name="comentario_obligatorio"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Requiere Comentario/Notas</FormLabel>
                  <FormDescription>
                    El usuario deberá escribir una observación obligatoria al finalizar.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>

        {/* OTROS REQUISITOS */}
        <div className="border-t pt-4 mt-2 space-y-4">
          <FormField
            control={form.control}
            name="archivo_obligatorio"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Requerir adjuntar un archivo</FormLabel>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="enviar_email"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Enviar un mail</FormLabel>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="responder_email"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Responder un correo</FormLabel>
                </div>
              </FormItem>
            )}
          />
        </div>

      </div>
    </div>
  );
}