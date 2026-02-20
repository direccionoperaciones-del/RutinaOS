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
import { Loader2, Mail, Send, Copy, Check, AlertTriangle, Link } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

const inviteUserSchema = z.object({
  nombre: z.string().min(2, "Mínimo 2 caracteres"),
  apellido: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(["director", "lider", "administrador", "auditor"]),
});

type InviteUserFormValues = z.infer<typeof inviteUserSchema>;

interface InviteUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function InviteUserModal({ open, onOpenChange, onSuccess }: InviteUserModalProps) {
  const { toast } = useToast();
  const { tenantId } = useCurrentUser();
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      nombre: "",
      apellido: "",
      email: "",
      role: "administrador",
    },
  });

  // Resetear estado al cerrar
  const handleOpenChange = (val: boolean) => {
    if (!val) {
        setTimeout(() => {
            setGeneratedLink(null);
            setCopied(false);
            form.reset();
        }, 300);
    }
    onOpenChange(val);
  }

  const onSubmit = async (values: InviteUserFormValues) => {
    if (!tenantId) {
      toast({ variant: "destructive", title: "Error", description: "No se ha identificado la organización." });
      return;
    }

    setIsLoading(true);
    setGeneratedLink(null);

    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          ...values,
          tenant_id: tenantId
        }
      });

      if (error) {
        let errorMessage = error.message;
        try {
          // @ts-ignore
          if (error.context && typeof error.context.json === 'function') {
             // @ts-ignore
             const body = await error.context.json();
             if (body && body.error) errorMessage = body.error;
          }
        } catch (e) {}
        throw new Error(errorMessage);
      }

      if (data && data.error) {
        throw new Error(data.error);
      }

      // CASO 1: Link Manual (SMTP falló o modo manual activado)
      if (data.inviteLink) {
        setGeneratedLink(data.inviteLink);
        onSuccess();
        toast({ 
            title: "Atención", 
            description: "No se pudo enviar el correo automático. Copia el enlace manualmente.",
            variant: "default" 
        });
      } 
      // CASO 2: Éxito Automático
      else {
        toast({ 
            title: "Invitación enviada", 
            description: `Se ha enviado un correo a ${values.email} con el enlace de acceso.` 
        });
        handleOpenChange(false);
        onSuccess();
      }

    } catch (error: any) {
      console.error("Error invitando usuario:", error);
      toast({ 
        variant: "destructive", 
        title: "Error al enviar invitación", 
        description: error.message || "Ocurrió un error inesperado." 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (generatedLink) {
        navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        toast({ title: "Copiado", description: "Enlace copiado al portapapeles." });
        setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        
        {/* --- VISTA DE ENLACE MANUAL --- */}
        {generatedLink ? (
            <>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-orange-600">
                        <AlertTriangle className="w-5 h-5" /> Acción Requerida
                    </DialogTitle>
                    <DialogDescription>
                        El sistema de correo no pudo entregar la invitación automáticamente.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <Alert className="bg-orange-50 border-orange-200 text-orange-800">
                        <Link className="h-4 w-4 text-orange-600" />
                        <AlertTitle>Enlace de Invitación Generado</AlertTitle>
                        <AlertDescription>
                            Copia el siguiente enlace y envíalo al usuario <strong>({form.getValues('email')})</strong> por WhatsApp, Slack o tu correo personal.
                        </AlertDescription>
                    </Alert>

                    <div className="flex gap-2 items-center mt-2">
                        <Input 
                            readOnly 
                            value={generatedLink} 
                            className="font-mono text-xs bg-muted text-muted-foreground h-10" 
                        />
                        <Button onClick={copyToClipboard} size="icon" className="shrink-0 h-10 w-10">
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={() => handleOpenChange(false)}>
                        Entendido, cerrar
                    </Button>
                </DialogFooter>
            </>
        ) : (
            /* --- VISTA DE FORMULARIO NORMAL --- */
            <>
                <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" /> Invitar Usuario
                </DialogTitle>
                <DialogDescription>
                    El usuario recibirá un enlace mágico por correo. Al hacer clic, ingresará directamente y podrá configurar su contraseña.
                </DialogDescription>
                </DialogHeader>
                
                <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
                    
                    <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="nombre"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre</FormLabel>
                            <FormControl><Input placeholder="Juan" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="apellido"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Apellido</FormLabel>
                            <FormControl><Input placeholder="Pérez" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    </div>

                    <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Correo Electrónico</FormLabel>
                        <FormControl>
                            <div className="relative">
                            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="empleado@empresa.com" className="pl-9" {...field} />
                            </div>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />

                    <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Rol</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            <SelectItem value="administrador">Administrador (PDV)</SelectItem>
                            <SelectItem value="lider">Líder (Supervisor)</SelectItem>
                            <SelectItem value="auditor">Auditor (Calidad)</SelectItem>
                            <SelectItem value="director">Director (Total)</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />

                    <DialogFooter className="mt-4">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <span className="flex items-center">Enviar Invitación <Send className="ml-2 h-4 w-4"/></span>}
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