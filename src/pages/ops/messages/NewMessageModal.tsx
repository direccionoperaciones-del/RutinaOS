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
import { Loader2, Send } from "lucide-react";

const messageSchema = z.object({
  asunto: z.string().min(1, "El asunto es obligatorio"),
  cuerpo: z.string().min(1, "El mensaje no puede estar vacío"),
  tipo: z.enum(["mensaje", "comunicado", "tarea_flash"]),
  prioridad: z.enum(["normal", "alta"]),
  requiere_confirmacion: z.boolean().default(false),
  recipient_type: z.enum(["all", "role", "pdv", "user"]),
  recipient_id: z.string().optional(), // Opcional si es 'all'
});

type MessageFormValues = z.infer<typeof messageSchema>;

interface NewMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NewMessageModal({ open, onOpenChange, onSuccess }: NewMessageModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Opciones para destinatarios
  const [roles] = useState([
    { id: 'administrador', name: 'Administradores' },
    { id: 'lider', name: 'Líderes' },
    { id: 'director', name: 'Directores' }
  ]);
  const [pdvs, setPdvs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const form = useForm<MessageFormValues>({
    resolver: zodResolver(messageSchema),
    defaultValues: {
      asunto: "",
      cuerpo: "",
      tipo: "comunicado",
      prioridad: "normal",
      requiere_confirmacion: false,
      recipient_type: "all",
      recipient_id: "",
    },
  });

  const recipientType = form.watch("recipient_type");

  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        // Cargar PDVs
        const { data: pdvData } = await supabase
          .from('pdv')
          .select('id, nombre, ciudad')
          .eq('activo', true);
        if (pdvData) setPdvs(pdvData);

        // Cargar Usuarios
        const { data: userData } = await supabase
          .from('profiles')
          .select('id, nombre, apellido, role')
          .eq('activo', true);
        if (userData) setUsers(userData);
      };
      fetchData();
      form.reset();
    }
  }, [open]);

  const onSubmit = async (values: MessageFormValues) => {
    if (values.recipient_type !== 'all' && !values.recipient_id) {
      form.setError('recipient_id', { message: 'Debe seleccionar un destinatario específico' });
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (!profile?.tenant_id) throw new Error("Sin tenant");

      // 1. Crear Mensaje
      const { data: msgData, error: msgError } = await supabase
        .from('messages')
        .insert({
          tenant_id: profile.tenant_id,
          tipo: values.tipo,
          asunto: values.asunto,
          cuerpo: values.cuerpo,
          prioridad: values.prioridad,
          requiere_confirmacion: values.requiere_confirmacion,
          created_by: user.id
        })
        .select()
        .single();

      if (msgError) throw msgError;

      // 2. Crear Destinatarios
      const { error: rcptError } = await supabase
        .from('message_recipients')
        .insert({
          message_id: msgData.id,
          recipient_type: values.recipient_type,
          recipient_id: values.recipient_type === 'all' ? null : values.recipient_id
        });

      if (rcptError) throw rcptError;

      toast({ title: "Enviado", description: "El mensaje ha sido enviado correctamente." });
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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Nuevo Comunicado</DialogTitle>
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
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="comunicado">Comunicado General</SelectItem>
                        <SelectItem value="mensaje">Mensaje Directo</SelectItem>
                        <SelectItem value="tarea_flash">Tarea Flash / Alerta</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="prioridad"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridad</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 border rounded-md p-3 bg-muted/20">
              <FormField
                control={form.control}
                name="recipient_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destinatarios</FormLabel>
                    <Select onValueChange={(val) => {
                      field.onChange(val);
                      form.setValue("recipient_id", ""); 
                    }} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">Todos los Usuarios</SelectItem>
                        <SelectItem value="role">Por Rol</SelectItem>
                        <SelectItem value="pdv">Por PDV (Equipo)</SelectItem>
                        <SelectItem value="user">Usuario Específico</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              {recipientType === 'role' && (
                <FormField
                  control={form.control}
                  name="recipient_id"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                           <SelectTrigger><SelectValue placeholder="Seleccione un rol..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              )}

              {recipientType === 'pdv' && (
                <FormField
                  control={form.control}
                  name="recipient_id"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                           <SelectTrigger><SelectValue placeholder="Seleccione un PDV..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pdvs.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre} - {p.ciudad}</SelectItem>)}
                        </SelectContent>
                      </Select>
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                           <SelectTrigger><SelectValue placeholder="Seleccione un usuario..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.nombre} {u.apellido} ({u.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  <FormControl><Input placeholder="Título del mensaje..." {...field} /></FormControl>
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
                    <Textarea placeholder="Escribe el contenido aquí..." className="h-24 resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="requiere_confirmacion"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Solicitar confirmación de lectura</FormLabel>
                    <FormDescription>
                      Los usuarios deberán marcar explícitamente que han leído el mensaje.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar Mensaje
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}