import { UseFormReturn } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RoutineFormValues } from "../routine-schema";

interface RoutineRequirementsTabProps {
  form: UseFormReturn<RoutineFormValues>;
}

export function RoutineRequirementsTab({ form }: RoutineRequirementsTabProps) {
  const watchFotos = form.watch("fotos_obligatorias");

  return (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-1 gap-4 border p-4 rounded-md">
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

        <div className="border-t pt-4 mt-2">
          <FormField
            control={form.control}
            name="requiere_inventario"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Incluye Toma de Inventario</FormLabel>
                  <FormDescription>
                    Se pedirá contar productos asociados a esta rutina (configurar luego).
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
}