import { useEffect, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RoutineFormValues } from "../routine-schema";
import { Loader2, ShieldCheck, MapPin, Camera, Package, MessageSquareText, FileText, Mail, CheckSquare } from "lucide-react";

// Componente simple de MultiSelect
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
          <label htmlFor={`cat-${opt.value}`} className="text-sm cursor-pointer w-full line-clamp-1">
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
    <div className="space-y-6 py-4">
      
      {/* SECCIÓN 1: CONTROL Y UBICACIÓN */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 border-b pb-2">
          <ShieldCheck className="w-4 h-4" /> Control y Seguridad
        </h3>
        
        <div className="grid gap-4">
          {/* Auditoría */}
          <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
            <FormField
              control={form.control}
              name="requiere_auditoria"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-blue-600" />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-blue-900 font-semibold">Requiere Auditoría Manual</FormLabel>
                    <FormDescription className="text-blue-700/80">
                      Si se activa, un auditor deberá aprobar la tarea. Si se desactiva, se aprueba automáticamente.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>

          {/* GPS */}
          <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
            <FormField
              control={form.control}
              name="gps_obligatorio"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-500" /> Validación GPS Obligatoria
                    </FormLabel>
                    <FormDescription>
                      El usuario debe estar dentro del radio del PDV para poder enviar la tarea.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: EVIDENCIAS */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 border-b pb-2">
          <Camera className="w-4 h-4" /> Evidencias
        </h3>

        <div className="grid gap-3">
          {/* Fotos */}
          <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
            <FormField
              control={form.control}
              name="fotos_obligatorias"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none w-full">
                    <FormLabel>Evidencia Fotográfica</FormLabel>
                    <FormDescription>
                      Solicita al usuario tomar fotos en el momento de la ejecución.
                    </FormDescription>
                    
                    {watchFotos && (
                      <div className="mt-3 max-w-[200px]">
                        <FormField
                          control={form.control}
                          name="min_fotos"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Mínimo de fotos requeridas</FormLabel>
                              <FormControl>
                                <Input type="number" min="1" className="h-8" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>
                </FormItem>
              )}
            />
          </div>

          {/* Inventario */}
          <div className={`p-3 border rounded-lg transition-colors ${watchInventario ? 'bg-orange-50/40 border-orange-200' : 'hover:bg-slate-50'}`}>
            <FormField
              control={form.control}
              name="requiere_inventario"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"/>
                  </FormControl>
                  <div className="space-y-1 leading-none w-full">
                    <FormLabel className={watchInventario ? "text-orange-900" : ""}>
                      Incluye Toma de Inventario
                    </FormLabel>
                    <FormDescription>
                      Habilita el módulo de conteo de productos asociados.
                    </FormDescription>

                    {watchInventario && (
                      <div className="mt-4 pt-3 border-t border-orange-200">
                        <FormField
                          control={form.control}
                          name="categorias_ids"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-bold text-orange-800 flex items-center gap-2">
                                <Package className="w-3 h-3" /> Categorías a Inventariar
                              </FormLabel>
                              {loadingCats ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando categorías...
                                </div>
                              ) : (
                                <SimpleMultiSelect 
                                  options={categories}
                                  value={field.value || []}
                                  onChange={field.onChange}
                                />
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>
                </FormItem>
              )}
            />
          </div>

          {/* Archivos */}
          <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
            <FormField
              control={form.control}
              name="archivo_obligatorio"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Adjuntar Archivo</FormLabel>
                    <FormDescription>
                      Permite subir documentos externos (PDF, Excel, etc) como evidencia.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: ACCIONES */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 border-b pb-2">
          <CheckSquare className="w-4 h-4" /> Acciones y Confirmaciones
        </h3>

        <div className="grid gap-3">
          {/* Comentarios */}
          <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
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
                      Obliga al usuario a escribir una observación o reporte al finalizar.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>

          {/* Enviar Email */}
          <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
            <FormField
              control={form.control}
              name="enviar_email"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Confirmación de Envío de Email</FormLabel>
                    <FormDescription>
                      Solicita marcar un checkbox confirmando que se ha enviado un correo requerido.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>

          {/* Responder Email */}
          <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
            <FormField
              control={form.control}
              name="responder_email"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Respuesta a un Email</FormLabel>
                    <FormDescription>
                      Solicita confirmar que se ha dado respuesta a correos pendientes.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>
      </div>

    </div>
  );
}