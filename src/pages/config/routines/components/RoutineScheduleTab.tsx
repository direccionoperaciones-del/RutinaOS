import { UseFormReturn } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { RoutineFormValues } from "../routine-schema";
import { useToast } from "@/hooks/use-toast";

interface RoutineScheduleTabProps {
  form: UseFormReturn<RoutineFormValues>;
}

const DIAS_SEMANA = [
  { label: "Dom", value: 0 },
  { label: "Lun", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Mié", value: 3 },
  { label: "Jue", value: 4 },
  { label: "Vie", value: 5 },
  { label: "Sáb", value: 6 },
];

export function RoutineScheduleTab({ form }: RoutineScheduleTabProps) {
  const { toast } = useToast();
  const watchFrecuencia = form.watch("frecuencia");
  const watchFechasEspecificas = form.watch("fechas_especificas");

  const toggleDia = (dia: number) => {
    const current = form.getValues("dias_ejecucion");
    if (current.includes(dia)) {
      form.setValue("dias_ejecucion", current.filter(d => d !== dia));
    } else {
      form.setValue("dias_ejecucion", [...current, dia]);
    }
  };

  const addSpecificDate = (date: Date | undefined) => {
    if (!date) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    const current = form.getValues("fechas_especificas");
    
    if (current.length >= 5) {
      toast({ variant: "destructive", title: "Límite alcanzado", description: "Máximo 5 fechas específicas." });
      return;
    }
    
    if (!current.includes(dateStr)) {
      form.setValue("fechas_especificas", [...current, dateStr]);
    }
  };

  const removeSpecificDate = (dateStr: string) => {
    const current = form.getValues("fechas_especificas");
    form.setValue("fechas_especificas", current.filter(d => d !== dateStr));
  };

  return (
    <div className="space-y-4 py-4">
      <FormField
        control={form.control}
        name="frecuencia"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Frecuencia de Ejecución</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="diaria">Diaria (Todos los días seleccionados)</SelectItem>
                <SelectItem value="semanal">Semanal (Días específicos)</SelectItem>
                <SelectItem value="quincenal">Quincenal (Dos cortes al mes)</SelectItem>
                <SelectItem value="mensual">Mensual (Una vez al mes)</SelectItem>
                <SelectItem value="fechas_especificas">Fechas Específicas</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* LOGICA CONDICIONAL DE FRECUENCIA */}
      <div className="p-4 border rounded-md bg-muted/20 space-y-4">
        
        {/* Diaria / Semanal */}
        {(watchFrecuencia === 'diaria' || watchFrecuencia === 'semanal') && (
          <FormItem>
            <FormLabel>Días de Ejecución</FormLabel>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((dia) => (
                <Button
                  key={dia.value}
                  type="button"
                  variant={form.watch("dias_ejecucion").includes(dia.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleDia(dia.value)}
                  className="w-12"
                >
                  {dia.label}
                </Button>
              ))}
            </div>
            <FormDescription>
              {watchFrecuencia === 'diaria' ? 'Generar tarea todos los días marcados.' : 'Generar tarea solo en los días seleccionados.'}
            </FormDescription>
          </FormItem>
        )}

        {/* Quincenal */}
        {watchFrecuencia === 'quincenal' && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="corte_1_limite"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vencimiento 1er Corte</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={d.toString()}>Día {d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Rango: 1 al 15</FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="corte_2_limite"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vencimiento 2do Corte</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {Array.from({ length: 16 }, (_, i) => i + 16).map((d) => (
                        <SelectItem key={d} value={d.toString()}>Día {d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Rango: 16 al 31</FormDescription>
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Mensual */}
        {watchFrecuencia === 'mensual' && (
          <FormField
            control={form.control}
            name="vencimiento_dia_mes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vencimiento (Día del mes)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={d.toString()}>Día {d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  La tarea se abre el día 1 y vence el día seleccionado.
                </FormDescription>
              </FormItem>
            )}
          />
        )}

        {/* Fechas Específicas */}
        {watchFrecuencia === 'fechas_especificas' && (
          <FormItem className="flex flex-col">
            <FormLabel>Seleccionar Fechas (Máx 5)</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-[240px] pl-3 text-left font-normal",
                    !watchFechasEspecificas && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  Agregar fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  onSelect={addSpecificDate}
                  disabled={(date) => date < new Date() || date < new Date("1900-01-01")}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            <div className="flex flex-wrap gap-2 mt-2">
              {watchFechasEspecificas.map((dateStr) => (
                <Badge key={dateStr} variant="secondary" className="px-3 py-1">
                  {format(new Date(dateStr + 'T12:00:00'), "P", { locale: es })}
                  <button
                    type="button"
                    className="ml-2 hover:text-destructive"
                    onClick={() => removeSpecificDate(dateStr)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {watchFechasEspecificas.length === 0 && (
                <span className="text-sm text-muted-foreground italic">Ninguna fecha seleccionada.</span>
              )}
            </div>
            <FormMessage />
          </FormItem>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 pt-2">
        <FormField
          control={form.control}
          name="hora_inicio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hora Inicio</FormLabel>
              <FormControl>
                <div className="relative">
                  <Clock className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input type="time" className="pl-8" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="hora_limite"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hora Límite</FormLabel>
              <FormControl>
                <div className="relative">
                  <Clock className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input type="time" className="pl-8" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}