import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckSquare, Store } from "lucide-react";

const assignmentSchema = z.object({
  rutina_id: z.string().min(1, "Debe seleccionar una rutina"),
  pdv_ids: z.array(z.string()).min(1, "Debe seleccionar al menos un PDV"),
});

type AssignmentFormValues = z.infer<typeof assignmentSchema>;

interface AssignmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AssignmentForm({ open, onOpenChange, onSuccess }: AssignmentFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [routines, setRoutines] = useState<any[]>([]);
  const [pdvs, setPdvs] = useState<any[]>([]);
  const [existingAssignments, setExistingAssignments] = useState<Set<string>>(new Set());

  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      rutina_id: "",
      pdv_ids: [],
    },
  });

  // Cargar datos iniciales
  useEffect(() => {
    const fetchData = async () => {
      const { data: rData } = await supabase
        .from('routine_templates')
        .select('id, nombre, frecuencia')
        .eq('activo', true)
        .order('nombre');
      
      const { data: pData } = await supabase
        .from('pdv')
        .select('id, nombre, ciudad, codigo_interno')
        .eq('activo', true)
        .order('nombre');

      if (rData) setRoutines(rData);
      if (pData) setPdvs(pData);
    };
    if (open) {
      fetchData();
      form.reset();
      setExistingAssignments(new Set());
    }
  }, [open]);

  // Cuando cambia la rutina seleccionada, buscar asignaciones existentes para deshabilitarlas visualmente o marcarlas
  const selectedRoutineId = form.watch("rutina_id");
  
  useEffect(() => {
    const fetchExisting = async () => {
      if (!selectedRoutineId) return;
      
      const { data } = await supabase
        .from('routine_assignments')
        .select('pdv_id')
        .eq('rutina_id', selectedRoutineId);
        
      if (data) {
        const assignedPdvIds = new Set(data.map(d => d.pdv_id));
        setExistingAssignments(assignedPdvIds);
        // Opcional: Podríamos pre-seleccionar los que ya la tienen, pero mejor dejar limpio para "Nuevas asignaciones"
        // O bloquear los que ya existen para evitar errores unique
      }
    };
    fetchExisting();
  }, [selectedRoutineId]);

  const onSubmit = async (values: AssignmentFormValues) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (!profile?.tenant_id) throw new Error("Sin tenant asignado");

      // Filtrar PDVs que ya tienen la asignación para evitar errores
      const newPdvIds = values.pdv_ids.filter(id => !existingAssignments.has(id));

      if (newPdvIds.length === 0) {
        toast({ title: "Información", description: "Los PDVs seleccionados ya tienen esta rutina asignada." });
        onOpenChange(false);
        return;
      }

      const rowsToInsert = newPdvIds.map(pdv_id => ({
        tenant_id: profile.tenant_id,
        rutina_id: values.rutina_id,
        pdv_id: pdv_id,
        estado: 'activa',
        created_by: user.id
      }));

      const { error } = await supabase
        .from('routine_assignments')
        .insert(rowsToInsert);

      if (error) throw error;

      toast({ 
        title: "Asignación exitosa", 
        description: `Se asignó la rutina a ${rowsToInsert.length} PDV(s).` 
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePdv = (pdvId: string) => {
    const current = form.getValues("pdv_ids");
    if (current.includes(pdvId)) {
      form.setValue("pdv_ids", current.filter(id => id !== pdvId));
    } else {
      form.setValue("pdv_ids", [...current, pdvId]);
    }
  };

  const toggleAll = () => {
    const current = form.getValues("pdv_ids");
    // Filtramos solo los disponibles (no asignados previamente)
    const availablePdvs = pdvs.filter(p => !existingAssignments.has(p.id)).map(p => p.id);
    
    if (current.length === availablePdvs.length) {
      form.setValue("pdv_ids", []);
    } else {
      form.setValue("pdv_ids", availablePdvs);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Asignar Rutina a PDVs</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex-1 flex flex-col min-h-0">
            
            {/* Paso 1: Seleccionar Rutina */}
            <FormField
              control={form.control}
              name="rutina_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>1. Selecciona la Rutina</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione una rutina..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {routines.map((routine) => (
                        <SelectItem key={routine.id} value={routine.id}>
                          {routine.nombre} ({routine.frecuencia})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Paso 2: Seleccionar PDVs */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <FormLabel>2. Selecciona los PDVs</FormLabel>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={toggleAll}
                  disabled={!selectedRoutineId}
                  className="text-xs h-6"
                >
                  Seleccionar disponibles
                </Button>
              </div>
              
              <div className="border rounded-md flex-1 min-h-0">
                <ScrollArea className="h-full p-4">
                  {!selectedRoutineId ? (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                      Primero selecciona una rutina
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pdvs.map((pdv) => {
                        const isAssigned = existingAssignments.has(pdv.id);
                        const isSelected = form.watch("pdv_ids").includes(pdv.id);
                        
                        return (
                          <div 
                            key={pdv.id} 
                            className={`flex items-start space-x-3 p-2 rounded hover:bg-muted/50 transition-colors ${isAssigned ? 'opacity-50' : ''}`}
                          >
                            <Checkbox 
                              id={`pdv-${pdv.id}`}
                              checked={isSelected || isAssigned}
                              disabled={isAssigned}
                              onCheckedChange={() => togglePdv(pdv.id)}
                            />
                            <div className="grid gap-1.5 leading-none">
                              <label 
                                htmlFor={`pdv-${pdv.id}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                              >
                                {pdv.nombre}
                              </label>
                              <p className="text-xs text-muted-foreground">
                                {pdv.codigo_interno} - {pdv.ciudad}
                                {isAssigned && <span className="text-green-600 ml-2 font-medium">(Ya asignada)</span>}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
              <FormMessage>{form.formState.errors.pdv_ids?.message}</FormMessage>
            </div>

            <DialogFooter className="mt-auto pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading || !selectedRoutineId}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Asignar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}