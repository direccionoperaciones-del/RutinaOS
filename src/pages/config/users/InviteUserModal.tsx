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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Send, Copy, Check, AlertTriangle, Link, Info } from "lucide-react";
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
        toast({ title: "Atención", description: "Configuración SMTP incompleta. Usa el link manual." });
      } else {
        toast({ title: "¡Correo enviado!", description: `Se envió la invitación a ${values.email}.` });
        handleClose();
      }
      onSuccess();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        {generatedLink ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-orange-600">
                <AlertTriangle className="w-5 h-5" /> Enlace Manual Generado
              </DialogTitle>
              <DialogDescription>
                Tu servidor de correo (SMTP) no respondió. Envía este link al usuario:
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted p-3 rounded-md border flex gap-2 items-center">
              <Input readOnly value={generatedLink} className="bg-transparent border-none text-xs font-mono" />
              <Button size="icon" onClick={() => { navigator.clipboard.writeText(generatedLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <div className="bg-blue-50 p-3 rounded text-[11px] text-blue-800 flex gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <p>Tip: Revisa que el <strong>Sender email</strong> en Supabase coincida con tu SMTP para evitar este mensaje.</p>
            </div>
            <Button className="w-full" onClick={handleClose}>Cerrar</Button>
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
                    <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="apellido" render={({ field }) => (
                    <FormItem><FormLabel>Apellido</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="usuario@empresa.com" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem><FormLabel>Rol</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="administrador">Administrador</SelectItem><SelectItem value="lider">Líder</SelectItem><SelectItem value="auditor">Auditor</SelectItem><SelectItem value="director">Director</SelectItem></SelectContent></Select>
                  </FormItem>
                )} />
                <DialogFooter><Button type="submit" disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />} Invitar</Button></DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}