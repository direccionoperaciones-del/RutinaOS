import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar as CalendarIcon, ShieldCheck, FileText } from "lucide-react";
import { RoutineGeneralTab } from "./components/RoutineGeneralTab";
import { RoutineScheduleTab } from "./components/RoutineScheduleTab";
import { RoutineRequirementsTab } from "./components/RoutineRequirementsTab";
import { routineSchema, RoutineFormValues } from "./routine-schema";

interface RoutineFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routineToEdit?: any;
  onSuccess: () => void;
}

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

              <TabsContent value="general">
                <RoutineGeneralTab form={form} />
              </TabsContent>

              <TabsContent value="planificacion">
                <RoutineScheduleTab form={form} />
              </TabsContent>

              <TabsContent value="requisitos">
                <RoutineRequirementsTab form={form} />
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