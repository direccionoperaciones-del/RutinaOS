import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
}

export function ResetPasswordDialog({ open, onOpenChange, user }: ResetPasswordDialogProps) {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ variant: "destructive", title: "Error", description: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    setIsResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        body: {
          action: 'reset_password',
          userId: user.id, // Enviamos ID directamente para evitar errores de búsqueda por email
          email: user.email, // Enviamos email como respaldo/log
          password: newPassword
        }
      });

      if (error) {
        // Intenta extraer mensaje de error del cuerpo si existe
        let msg = error.message;
        try {
            // @ts-ignore
            if(error.context && error.context.json) {
                // @ts-ignore
                const body = await error.context.json();
                if(body.error) msg = body.error;
            }
        } catch(e) {}
        throw new Error(msg);
      }

      if (data && data.error) throw new Error(data.error);

      toast({ title: "Éxito", description: `Contraseña actualizada para ${user.nombre}.` });
      onOpenChange(false);
      setNewPassword("");
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Error al guardar", description: err.message || "Error de conexión con el servidor." });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Establecer Contraseña Manual</DialogTitle>
          <DialogDescription>
            Asigna una contraseña temporal para <strong>{user?.nombre}</strong>. 
            El usuario podrá iniciar sesión con su email y esta contraseña.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="pass">Nueva Contraseña</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                id="pass" 
                type="text" 
                placeholder="Ej: Chef2024*" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleResetPassword} disabled={isResetting}>
            {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Contraseña
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}