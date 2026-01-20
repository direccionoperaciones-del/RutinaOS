import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Clock, Calendar as CalendarIcon, ShieldCheck, FileText, X, Plus } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Esquema de validación actualizado
const routineSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  prioridad: z.enum(["baja", "media", "alta", "critica"]),
  frecuencia: z.enum(["diaria", "semanal", "quincenal", "mensual", "fechas_especificas"]),
  
  // Horarios
  hora_inicio: z.string(),
  hora_limite: z.string(),
  
  // Configuración Frecuencias
  dias_ejecucion: z.array(z.number()).default([]), // 0=Dom, 1=Lun...
  corte_1_limite: z.coerce.number().optional(), // Para Quincenal (1-15)
  corte_2_limite: z.coerce.number().optional(), // Para Quincenal (16-31)
  vencimiento_dia_mes: z.coerce.number().optional(), // Para Mensual (1-31)
  fechas_especificas: z.array(z.string()).max(5, "Máximo 5 fechas específicas").default([]),

  // Requisitos
  gps_obligatorio: z.boolean().default(false),
  fotos_obligatorias: z.boolean().default(false),
  min_fotos: z.coerce.number().min(0).default(0),
  requiere_inventario: z.boolean().default(false),
  activo: z.boolean().default(true),
  roles_ejecutores: z.array(z.string()).default(["administrador"]),
});

type RoutineFormValues = z.infer<typeof routineSchema>;

interface RoutineFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routineToEdit?: any;
  onSuccess: () => void;
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

export function RoutineForm({ open, onOpenChange, routineToEdit, onSuccess }: RoutineFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<RoutineFormValues>({
    resolver: zodResolver(routineSchema),
    defaultValues: {
      nombre: "",
      descripcion: "",
      prioridad: "media",
      frecuencia: "diaria",
      hora_inicio: "08:00",
      hora_limite: "18:00",
      dias_ejecucion: [],
      corte_1_limite: 15,
      corte_2_limite: 30,
      vencimiento_dia_mes: 5,
      fechas_especificas: [],
      gps_obligatorio: false,
      fotos_obligatorias: false,
      min_fotos: 0,
      requiere_inventario: false,
      activo: true,
      roles_ejecutores: ["administrador"],
    },
  });

  const watchFrecuencia = form.watch("frecuencia");
  const watchFotos = form.watch("fotos_obligatorias");
  const watchFechasEspecificas = form.watch("fechas_especificas");

  useEffect(() => {
    if (routineToEdit) {
      form.reset({
        nombre: routineToEdit.nombre,
        descripcion: routineToEdit.descripcion,
        prioridad: routineToEdit.prioridad,
        frecuencia: routineToEdit.frecuencia,
        hora_inicio: routineToEdit.hora_inicio?.slice(0, 5) || "08:00",
        hora_limite: routineToEdit.hora_limite?.slice(0, 5) || "18:00",
        dias_ejecucion: routineToEdit.dias_ejecucion || [],
        corte_1_limite: routineToEdit.corte_1_limite || 15,
        corte_2_limite: routineToEdit.corte_2_limite || 30,
        vencimiento_dia_mes: routineToEdit.vencimiento_dia_mes || 5,
        fechas_especificas: routineToEdit.fechas_especificas || [],
        gps_obligatorio: routineToEdit.gps_obligatorio,
        fotos_obligatorias: routineToEdit.fotos_obligatorias,
        min_fotos: routineToEdit.min_fotos,
        requiere_inventario: routineToEdit.requiere_inventario,
        activo: routineToEdit.activo,
        roles_ejecutores: routineToEdit.roles_ejecutores || ["administrador"],
      });
    } else {
      form.reset({
        nombre: "",
        descripcion: "",
        prioridad: "media",
        frecuencia: "diaria",
        hora_inicio: "08:00",
        hora_limite: "18:00",
        dias_ejecucion: [],
        corte_1_limite: 15,
        corte_2_limite: 30,
        vencimiento_dia_mes: 5,
        fechas_especificas: [],
        gps_obligatorio: false,
        fotos_obligatorias: false,
        min_fotos: 0,
        requiere_inventario: false,
        activo: true,
        roles_ejecutores: ["administrador"],
      });
    }
  }, [routineToEdit, form, open]);

  const onSubmit = async (values: RoutineFormValues) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (!profile?.tenant_id) throw new Error("Sin tenant asignado");

      // Validaciones lógicas extra
      if (values.frecuencia === 'semanal' && values.dias_ejecucion.length === 0) {
        throw new Error("Debe seleccionar al menos un día de ejecución para frecuencia semanal.");
      }
      
      if (values.frecuencia === 'fechas_especificas' && values.fechas_especificas.length === 0) {
        throw new Error("Debe seleccionar al menos una fecha específica.");
      }

      const payload = {
        tenant_id: profile.tenant_id,
        ...values,
        created_by: user.id
      };

      if (routineToEdit) {
        const { error } = await supabase.from('routine_templates').update(payload).eq('id', routineToEdit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('routine_templates').insert(payload);
        if (error) throw error;
      }

      toast({ title: "Éxito", description: "Rutina guardada correctamente" });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{routineToEdit ? "Editar Rutina" : "Nueva Rutina Operativa"}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general"><FileText className="w-4 h-4 mr-2"/> General</TabsTrigger>
                <TabsTrigger value="planificacion"><CalendarIcon className="w-4 h-4 mr-2"/> Frecuencia</TabsTrigger>
                <TabsTrigger value="requisitos"><ShieldCheck className="w-4 h-4 mr-2"/> Requisitos</TabsTrigger>
              </TabsList>

              {/* TAB GENERAL */}
              <TabsContent value="general" className="space-y-4 py-4">
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
              </TabsContent>

              {/* TAB PLANIFICACION */}
              <TabsContent value="planificacion" className="space-y-4 py-4">
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
              </TabsContent>

              {/* TAB REQUISITOS */}
              <TabsContent value="requisitos" className="space-y-4 py-4">
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
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar Rutina
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}