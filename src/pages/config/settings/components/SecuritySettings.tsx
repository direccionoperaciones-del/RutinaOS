import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock, Loader2 } from "lucide-react";

export function SecuritySettings() {
  const { toast } = useToast();
  const [passwordData, setPasswordData] = useState({ password: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async () => {
    if (passwordData.password !== passwordData.confirm) {
      toast({ variant: "destructive", title: "Error", description: "Las contraseñas no coinciden." });
      return;
    }
    if (passwordData.password.length < 6) {
      toast({ variant: "destructive", title: "Error", description: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordData.password });
      if (error) throw error;
      
      toast({ title: "Contraseña actualizada", description: "Usa tu nueva contraseña la próxima vez que inicies sesión." });
      setPasswordData({ password: "", confirm: "" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" /> Seguridad
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="password">Nueva Contraseña</Label>
          <Input 
            id="password" 
            type="password" 
            value={passwordData.password} 
            onChange={(e) => setPasswordData({...passwordData, password: e.target.value})}
            placeholder="Mínimo 6 caracteres"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirm">Confirmar Contraseña</Label>
          <Input 
            id="confirm" 
            type="password" 
            value={passwordData.confirm} 
            onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})}
          />
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button variant="outline" onClick={handleChangePassword} disabled={saving || !passwordData.password}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Actualizar Contraseña
        </Button>
      </CardFooter>
    </Card>
  );
}