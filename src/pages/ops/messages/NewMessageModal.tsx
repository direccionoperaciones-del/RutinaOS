import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, ClipboardList, CalendarClock, Clock } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { useCurrentUser } from "@/hooks/use-current-user";

const messageSchema = z.object({
  asunto: z.string().min(1, "El asunto es obligatorio"),
  cuerpo: z.string().min(1, "El mensaje no puede estar vacío"),
  tipo: z.enum(["mensaje", "comunicado", "tarea_flash"]),
  prioridad: z.enum(["normal", "alta"]),
  requiere_confirmacion: z.boolean().default(false),
  recipient_type: z.enum(["all", "role", "pdv", "user"]),
  recipient_id: z.union([z.string(), z.array(z.string())]), 
  rutina_id: z.string().optional(),
  scheduled_date: z.string().optional(),
  scheduled_time: z.string().optional(),
}).refine((data) => {
  if (data.tipo === 'tarea_flash' && !data.rutina_id) {
    return false;
  }
  return true;
}, {
  message: "Debe seleccionar una rutina para la Tarea Flash",
  path: ["rutina_id"],
}).refine((data) => {
  if (data.recipient_type !== 'all') {
    if (Array.isArray(data.recipient_id)) {
      return data.recipient_id.length > 0;
    }
    return !!data.recipient_id;
  }
  return true;
}, {
  message: "Seleccione al menos un destinatario",
  path: ["recipient_id"]
});

type MessageFormValues = z.infer<typeof messageSchema>;

interface NewMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NewMessageModal({ open, onOpenChange, onSuccess }: NewMessageModalProps) {
  const { toast } = useToast();
  const { profile } = useCurrentUser();
  const [isLoading, setIsLoading] = useState(false);
  
  const [roles] = useState([
    { id: 'administrador', name: 'Administradores' },
    { id: 'lider', name: 'Líderes' },
    { id: 'director', name: 'Directores' },
    { id: 'auditor', name: 'Auditores' }
  ]);
  const [pdvOptions, setPdvOptions] = useState<{label: string, value: string}[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);

  const form = useForm<MessageFormValues>({
    resolver: zodResolver(messageSchema),
    defaultValues: {
      asunto: "",
      cuerpo: "",
      tipo: "comunicado",
      prioridad: "normal",
      requiere_confirmacion: false,
      recipient_type: "role",
      recipient_id: "",
      rutina_id: "",
      scheduled_date: "",
      scheduled_time: ""
    },
  });

  const recipientType = form.watch("recipient_type");
  const messageType = form.watch("tipo");

  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        const { data: pdvData } = await supabase.from('pdv').select('id, nombre, ciudad').eq('activo', true);
        if (pdvData) {
          setPdvOptions(pdvData.map(p => ({ label: `${p.nombre} (${p.ciudad})`, value: p.id })));
        }

        const { data: userData } = await supabase.from('profiles').select('id, nombre, apellido, role').eq('activo', true);
        if (userData) setUsers(userData);

        const { data: routineData } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true).order('nombre');
        if (routineData) setRoutines(routineData);
      };
      fetchData();
      form.reset();
    }
  }, [open]);

  useEffect(() => {
    if (messageType === 'tarea_flash' && !form.getValues('asunto')) {
      form.setValue('asunto', '🚨 Tarea Flash Prioritaria');
      form.setValue('prioridad', 'alta');
      form.setValue('requiere_confirmacion', true);
    }
  }, [messageType]);

  useEffect(() => {
    form.setValue("recipient_id", recipientType === 'pdv' ? [] : "");
  }, [recipientType]);

  const onSubmit = async (values: MessageFormValues) => {
    setIsLoading(true);
    try {
      if (!profile?.tenant_id) throw new Error("Error de sesión: Sin Tenant ID.");

      let finalRecipientId: string | null = null;

      if (values.recipient_type === 'all') {
        finalRecipientId = null;
      } else if (values.recipient_type === 'pdv') {
        finalRecipientId = JSON.stringify(values.recipient_id);
      } else {
        finalRecipientId = values.recipient_id as string;
      }

      // 1. Enviar Mensaje (RPC)
      const { data: messageId, error } = await supabase.rpc('send_broadcast_message', {
        p_asunto: values.asunto,
        p_cuerpo: values.cuerpo,
        p_tipo: values.tipo,
        p_prioridad: values.prioridad,
        p_requiere_confirmacion: values.requiere_confirmacion,
        p_recipient_type: values.recipient_type,
        p_recipient_id: finalRecipientId,
        p_rutina_id: null, // Desactivar creación automática SQL
        p_fecha_programada: values.scheduled_date || null,
        p_hora_programada: values.scheduled_time || null
      });

      if (error) throw error;

      // 2. CREACIÓN MANUAL DE TAREAS (Frontend Logic para Tareas Flash)
      if (values.tipo === 'tarea_flash' && values.rutina_id) {
        
        // A. Resolver Usuarios
        let targetUserIds: string[] = [];
        
        if (values.recipient_type === 'user') {
          targetUserIds = [values.recipient_id as string];
        } else if (values.recipient_type === 'role') {
          const { data } = await supabase.from('profiles').select('id').eq('role', values.recipient_id).eq('activo', true);
          targetUserIds = (data || []).map(u => u.id);
        } else if (values.recipient_type === 'pdv') {
          const pdvIds = Array.isArray(values.recipient_id) ? values.recipient_id : [values.recipient_id];
          const { data } = await supabase.from('pdv_assignments')
            .select('user_id')
            .in('pdv_id', pdvIds)
            .eq('vigente', true);
          targetUserIds = (data || []).map(u => u.user_id);
        } else if (values.recipient_type === 'all') {
          const { data } = await supabase.from('profiles').select('id').eq('activo', true);
          targetUserIds = (data || []).map(u => u.id);
        }

        // Eliminar duplicados
        targetUserIds = [...new Set(targetUserIds)];

        if (targetUserIds.length > 0) {
          // B. Mapear PDVs
          const { data: assignments } = await supabase
            .from('pdv_assignments')
            .select('user_id, pdv_id')
            .in('user_id', targetUserIds)
            .eq('vigente', true);
          
          const mapUserPdv = new Map();
          assignments?.forEach(a => mapUserPdv.set(a.user_id, a.pdv_id));

          // C. Fallback: Obtener un PDV por defecto si el usuario no tiene (Para que la tarea se cree sí o sí)
          const { data: fallbackPdv } = await supabase
            .from('pdv')
            .select('id')
            .eq('tenant_id', profile.tenant_id)
            .eq('activo', true)
            .limit(1)
            .maybeSingle();
          
          const defaultPdvId = fallbackPdv?.id;

          // D. Construir Tareas
          const tasksToInsert = targetUserIds.map(uid => {
            const pdvId = mapUserPdv.get(uid) || defaultPdvId;
            
            if (!pdvId) return null; // Si no hay ni PDV asignado ni default, no se puede crear

            const fecha = values.scheduled_date || new Date().toISOString().split('T')[0];

            return {
              tenant_id: profile.tenant_id,
              rutina_id: values.rutina_id,
              pdv_id: pdvId,
              responsable_id: uid,
              fecha_programada: fecha,
              hora_inicio_snapshot: '00:00:00',
              hora_limite_snapshot: '23:59:59',
              estado: 'pendiente',
              prioridad_snapshot: 'critica', // Flash siempre es crítica
              created_at: new Date().toISOString()
            };
          }).filter(t => t !== null);

          if (tasksToInsert.length > 0) {
            const { error: taskError } = await supabase.from('task_instances').insert(tasksToInsert);
            if (taskError) {
              console.error("Error creating flash tasks:", taskError);
              toast({ variant: "destructive", title: "Advertencia", description: "Mensaje enviado, pero hubo error creando algunas tareas." });
            }
          }
        }
      }

      // 3. Notificaciones Push
      if (!values.scheduled_date && messageId) {
        supabase.functions.invoke('notify-message', { body: { message_id: messageId } })
          .catch(e => console.error("Push Error", e));
      }

      let desc = "Mensaje enviado correctamente.";
      if (values.tipo === 'tarea_flash') desc = "Tarea Flash asignada y notificada a los usuarios.";

      toast({ title: "Enviado", description: desc });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Mensaje / Tarea Flash</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="comunicado">Comunicado (Info)</SelectItem>
                        <SelectItem value="mensaje">Mensaje Directo</SelectItem>
                        <SelectItem value="tarea_flash">Tarea Flash (Acción)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="prioridad"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridad</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            {/* SECCIÓN PROGRAMACIÓN */}
            <div className="p-4 bg-muted/40 border rounded-md space-y-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                    <CalendarClock className="w-3 h-3" /> Programación (Opcional)
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scheduled_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Fecha</FormLabel>
                        <FormControl><Input type="date" {...field} className="bg-white h-8 text-xs" /></FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scheduled_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Hora</FormLabel>
                        <FormControl><Input type="time" {...field} className="bg-white h-8 text-xs" /></FormControl>
                      </FormItem>
                    )}
                  />
                </div>
            </div>

            {/* CONFIGURACIÓN ESPECÍFICA TAREA FLASH */}
            {messageType === 'tarea_flash' && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-md animate-in fade-in slide-in-from-top-2 space-y-4">
                <FormField
                  control={form.control}
                  name="rutina_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-orange-900 flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" /> Rutina a Ejecutar
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white border-orange-200">
                            <SelectValue placeholder="Seleccione una rutina..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {routines.map(r => (
                            <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="text-xs text-orange-800">
                  <p><strong>Nota:</strong> Se creará una tarea crítica para todos los destinatarios seleccionados.</p>
                </div>
              </div>
            )}

            <div className="space-y-3 p-3 bg-muted/30 rounded border">
              <FormField
                control={form.control}
                name="recipient_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destinatarios</FormLabel>
                    <Select 
                      onValueChange={(val) => {
                        field.onChange(val);
                        form.setValue("recipient_id", val === 'pdv' ? [] : ""); 
                      }} 
                      defaultValue={field.value}
                    >
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="pdv">Por PDV (Múltiple)</SelectItem>
                        <SelectItem value="role">Por Rol (Grupo)</SelectItem>
                        <SelectItem value="user">Usuario Específico</SelectItem>
                        <SelectItem value="all">Todos (Global)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              {recipientType === 'pdv' && (
                <FormField
                  control={form.control}
                  name="recipient_id"
                  render={({ field }) => (
                    <FormItem>
                      <MultiSelect 
                        options={pdvOptions} 
                        selected={Array.isArray(field.value) ? field.value : []} 
                        onChange={field.onChange} 
                        placeholder="Seleccionar PDVs..."
                        className="bg-background"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {recipientType === 'role' && (
                <FormField
                  control={form.control}
                  name="recipient_id"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value as string}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione Rol..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {recipientType === 'user' && (
                <FormField
                  control={form.control}
                  name="recipient_id"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value as string}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Busque usuario..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.nombre} {u.apellido}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="asunto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asunto</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cuerpo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensaje</FormLabel>
                  <FormControl>
                    <Textarea className="h-24" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="requiere_confirmacion"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Solicitar confirmación de lectura</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}