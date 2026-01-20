import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Building, User, Lock, Loader2 } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*, tenants(*)')
        .eq('id', user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setTenant(profileData.tenants);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulación de actualización
    setTimeout(() => {
      setLoading(false);
      toast({ title: "Perfil actualizado", description: "Los cambios se han guardado." });
    }, 1000);
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Ajustes</h2>
        <p className="text-muted-foreground">Configuración de cuenta y organización.</p>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="account">Mi Cuenta</TabsTrigger>
          <TabsTrigger value="organization">Organización</TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Información Personal</CardTitle>
              <CardDescription>Actualiza tus datos de contacto y rol.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input defaultValue={profile?.nombre} />
                </div>
                <div className="space-y-2">
                  <Label>Apellido</Label>
                  <Input defaultValue={profile?.apellido} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input defaultValue={profile?.email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Rol Actual</Label>
                <div className="flex items-center gap-2 p-2 border rounded bg-muted/50 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="capitalize font-medium">{profile?.role}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateProfile} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </CardFooter>
          </Card>

          <Card className="mt-6 border-red-100">
            <CardHeader>
              <CardTitle className="text-red-600">Seguridad</CardTitle>
              <CardDescription>Gestión de contraseña y sesiones.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full sm:w-auto">
                <Lock className="mr-2 h-4 w-4" /> Cambiar Contraseña
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>Datos de la Empresa</CardTitle>
              <CardDescription>Información del Tenant actual.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre de la Organización</Label>
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-muted-foreground" />
                  <Input defaultValue={tenant?.nombre} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Código de Tenant</Label>
                <Input defaultValue={tenant?.codigo} disabled className="bg-muted font-mono" />
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" disabled>Contactar Soporte para cambios</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}