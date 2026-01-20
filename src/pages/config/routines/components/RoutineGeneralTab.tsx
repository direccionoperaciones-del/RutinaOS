import { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RoutineFormValues } from "../routine-schema";

interface RoutineGeneralTabProps {
  form: UseFormReturn<RoutineFormValues>;
}

export function RoutineGeneralTab({ form }: RoutineGeneralTabProps) {
  return (
    <div className="space-y-4 py-4">
      <FormField
        control={form.control}
        name="nombre"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre de la Rutina *</FormLabel>
            <FormControl><Input placeholder="Ej: Apertura de Caja" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="descripcion"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Descripción / Instrucciones *</FormLabel>
            <FormControl>
              <Textarea 
                placeholder="Describe paso a paso lo que debe hacer el usuario..." 
                className="resize-none h-24"
                {...field} 
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="prioridad"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Prioridad</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="activo"
          render={({ field }) => (
            <FormItem className="flex flex-col justify-end pb-2">
                <div className="flex items-center space-x-2">
                <Checkbox 
                  id="activo" 
                  checked={field.value} 
                  onCheckedChange={field.onChange} 
                />
                <label htmlFor="activo" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Rutina Activa
                </label>
              </div>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}