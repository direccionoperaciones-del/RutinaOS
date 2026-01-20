import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Building, User, Lock, Loader2, Save } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function SettingsPage() {
  const { toast } = useToast();
  const { profile, loading: loadingProfile } = useCurrentUser();
  
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
  });
  const [passwordData, setPasswordData] = useState({
    password: "",
    confirm: ""
  });
  
  const [saving, setSaving] = useState(false);

  // Cargar datos cuando el perfil esté listo
  useEffect(() => {
    if (profile) {
      setFormData({
        nombre: profile.nombre || "",
        apellido: profile.apellido || ""
      });
    }
  }, [profile]);

  const handleUpdateProfile = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          nombre: formData.nombre,
          apellido: formData.apellido
        })
        .eq('id', profile.id);

      if (error) throw error;

      toast({ title: "Perfil actualizado", description: "Tus datos personales han sido guardados." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

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
      const { error } = await supabase.auth.updateUser({
        password: passwordData.password
      });

      if (error) throw error;

      toast({ title: "Contraseña actualizada", description: "Tu contraseña ha sido cambiada exitosamente." });
      setPasswordData({ password: "", confirm: "" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loadingProfile) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Ajustes y Perfil</h2>
        <p className="text-muted-foreground">Gestiona tu información personal y seguridad.</p>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="account">Mi Cuenta</TabsTrigger>
          <TabsTrigger value="organization">Organización</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-6">
          {/* Datos Personales */}
          <Card>
            <CardHeader>
              <CardTitle>Información Personal</CardTitle>
              <CardDescription>Estos datos aparecerán en los reportes y registros.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input 
                    value={formData.nombre} 
                    onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Apellido</Label>
                  <Input 
                    value={formData.apellido} 
                    onChange={(e) => setFormData({...formData, apellido: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile?.email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Rol en el sistema</Label>
                <div className="flex items-center gap-2 p-2 border rounded bg-muted/50 text-sm w-fit px-4">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="capitalize font-medium">{profile?.role}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateProfile} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar Cambios
              </Button>
            </CardFooter>
          </Card>

          {/* Seguridad */}
          <Card className="border-orange-200 bg-orange-50/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-orange-500" /> 
                Seguridad
              </CardTitle>
              <CardDescription>Actualizar contraseña de acceso.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nueva Contraseña</Label>
                  <Input 
                    type="password" 
                    placeholder="Mínimo 6 caracteres"
                    value={passwordData.password}
                    onChange={(e) => setPasswordData({...passwordData, password: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirmar Contraseña</Label>
                  <Input 
                    type="password" 
                    placeholder="Repetir contraseña"
                    value={passwordData.confirm}
                    onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={handleChangePassword} disabled={saving || !passwordData.password}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Actualizar Contraseña
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>Datos de la Empresa</CardTitle>
              <CardDescription>Información del Tenant asignado a tu usuario.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre de la Organización</Label>
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-muted-foreground" />
                  <Input value={profile?.tenants?.nombre || ''} readOnly />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Código de Tenant</Label>
                <Input value={profile?.tenants?.codigo || ''} disabled className="bg-muted font-mono" />
                <p className="text-xs text-muted-foreground">Este código identifica tu base de datos aislada.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}