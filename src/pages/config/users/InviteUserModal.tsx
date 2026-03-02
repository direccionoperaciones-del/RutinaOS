import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Send, Copy, Check, Info, ExternalLink } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

const inviteUserSchema = z.object({
  nombre: z.string().min(2, "Mínimo 2 caracteres"),
  apellido: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(["director", "lider", "administrador", "auditor"]),
});

export function InviteUserModal({ open, onOpenChange, onSuccess }: any) {
  const { toast } = useToast();
  const { tenantId } = useCurrentUser();
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<z.infer<typeof inviteUserSchema>>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { nombre: "", apellido: "", email: "", role: "administrador" },
  });

  const handleClose = () => {
    setGeneratedLink(null);
    form.reset();
    onOpenChange(false);
  };

  const onSubmit = async (values: z.infer<typeof inviteUserSchema>) => {
    setIsLoading(true);
    setGeneratedLink(null);
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { ...values, tenant_id: tenantId }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.manualMode) {
        setGeneratedLink(data.inviteLink);
        toast({ title: "Enlace generado", description: "Envía este enlace al usuario manualmente." });
      } else {
        toast({ title: "¡Invitación enviada!", description: `Se envió un correo a ${values.email}.` });
        handleClose();
      }
      onSuccess();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copiado", description: "Enlace listo para enviar." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        {generatedLink ? (
          <div className="space-y-4 py-2">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                <Mail className="w-5 h-5" /> Invitación Lista
              </DialogTitle>
              <DialogDescription>
                El correo automático no pudo enviarse (SMTP no configurado). **Copia y envía este enlace al usuario** para que active su cuenta:
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex gap-2 items-center bg-muted p-3 rounded-lg border">
              <Input readOnly value={generatedLink} className="bg-transparent border-none text-xs font-mono h-8 focus-visible:ring-0" />
              <Button size="icon" variant="ghost" onClick={copyToClipboard} className="shrink-0">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex gap-3 items-start border border-blue-100 dark:border-blue-800">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                  <strong>¿Quieres automatizar esto?</strong> Configura tu servidor de correo en el panel de Supabase para que los emails salgan solos.
                </p>
                <Button variant="link" size="sm" className="h-auto p-0 text-blue-700 dark:text-blue-400 text-xs" asChild>
                  <a href="https://supabase.com/dashboard/project/_/settings/auth" target="_blank" rel="noreferrer">
                    Ir a configuración SMTP <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </Button>
              </div>
            </div>

            <Button className="w-full" onClick={handleClose}>Entendido</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Invitar Usuario</DialogTitle>
              <DialogDescription>Se enviará un enlace de acceso al correo indicado.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="nombre" render={({ field }) => (
                    <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input placeholder="Ej: Maria" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="apellido" render={({ field }) => (
                    <FormItem><FormLabel>Apellido</FormLabel><FormControl><Input placeholder="Ej: Garcia" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="usuario@empresa.com" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem><FormLabel>Rol / Permisos</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="administrador">Administrador (PDV)</SelectItem>
                      <SelectItem value="lider">Líder (Supervisor)</SelectItem>
                      <SelectItem value="auditor">Auditor (Calidad)</SelectItem>
                      <SelectItem value="director">Director (Total)</SelectItem>
                    </SelectContent></Select>
                  </FormItem>
                )} />
                <DialogFooter className="pt-4">
                  <Button variant="ghost" type="button" onClick={handleClose}>Cancelar</Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />} 
                    Enviar Invitación
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}