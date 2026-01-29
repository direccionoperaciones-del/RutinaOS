import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Building, User, Lock, Loader2, Save, Camera, UploadCloud, Image as ImageIcon, Bell, BellRing, Smartphone } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePushSubscription } from "@/hooks/use-push-subscription";

export default function SettingsPage() {
  const { toast } = useToast();
  const { profile, loading: loadingProfile } = useCurrentUser();
  const { isSupported, isSubscribed, subscribeToPush, loading: pushLoading, error: pushError, sendTestPush } = usePushSubscription();
  
  // Estado para datos personales
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
  });

  // Estado para datos de la organización
  const [orgData, setOrgData] = useState({
    nombre: ""
  });

  // Estado para contraseña
  const [passwordData, setPasswordData] = useState({
    password: "",
    confirm: ""
  });
  
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);

  // Cargar datos cuando el perfil esté listo
  useEffect(() => {
    if (profile) {
      // Datos personales
      setFormData({
        nombre: profile.nombre || "",
        apellido: profile.apellido || ""
      });
      setAvatarUrl(profile.avatar_url);
      
      // Datos de organización
      if (profile.tenants) {
        setCompanyLogoUrl(profile.tenants.logo_url);
        setOrgData({ nombre: profile.tenants.nombre });
      }
    }
  }, [profile]);

  // Guardar Perfil Usuario
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
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  // Guardar Datos Organización
  const handleUpdateOrganization = async () => {
    setSaving(true);
    try {
      if (!profile?.tenant_id) throw new Error("No tienes una organización asignada.");

      const { error } = await supabase
        .from('tenants')
        .update({ nombre: orgData.nombre })
        .eq('id', profile.tenant_id);

      if (error) throw error;

      toast({ title: "Organización actualizada", description: "El nombre de la empresa ha sido guardado." });
      // Recargamos para que el nombre se actualice en la barra lateral
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Debes seleccionar una imagen.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${profile.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      toast({ title: "Foto actualizada", description: "Tu nueva foto de perfil se ha guardado." });
      setTimeout(() => window.location.reload(), 800);

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al subir imagen", description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleCompanyLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!profile?.tenant_id) throw new Error("No tienes una organización asignada.");
      
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Debes seleccionar una imagen.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `tenant_${profile.tenant_id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('tenants')
        .update({ logo_url: publicUrl })
        .eq('id', profile.tenant_id);

      if (updateError) throw updateError;

      setCompanyLogoUrl(publicUrl);
      toast({ title: "Logo actualizado", description: "La imagen de la organización se ha guardado." });
      setTimeout(() => window.location.reload(), 1000);
      
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al subir logo", description: error.message });
    } finally {
      setUploading(false);
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

  const handleSubscribe = async () => {
    const success = await subscribeToPush();
    if (success) {
      toast({ title: "Notificaciones activadas", description: "Recibirás alertas en este dispositivo." });
    } else {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron activar las notificaciones. Verifica permisos del navegador." });
    }
  };

  if (loadingProfile) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 pb-20">
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
          
          {/* NOTIFICACIONES PWA - NUEVA SECCIÓN */}
          <Card className={`border ${isSubscribed ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className={`w-5 h-5 ${isSubscribed ? 'text-green-600' : 'text-blue-600'}`} /> 
                Notificaciones Móviles
              </CardTitle>
              <CardDescription>Recibe alertas instantáneas en tu dispositivo.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Smartphone className="w-8 h-8 opacity-50" />
                  <div>
                    {isSupported ? (
                      isSubscribed ? (
                        <span className="text-green-700 font-medium">✅ Dispositivo conectado y activo.</span>
                      ) : (
                        <span>Activa las notificaciones para no perder tareas urgentes.</span>
                      )
                    ) : (
                      <span className="text-red-500">Tu navegador no soporta notificaciones Push. Usa Chrome o Safari (iOS instalado).</span>
                    )}
                  </div>
                </div>
                
                {isSupported && (
                  <div className="flex gap-2">
                    {isSubscribed && (
                      <Button variant="outline" size="sm" onClick={sendTestPush}>
                        Probar
                      </Button>
                    )}
                    <Button 
                      onClick={handleSubscribe} 
                      disabled={isSubscribed || pushLoading} 
                      className={isSubscribed ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                      {pushLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {isSubscribed ? "Activado" : "Activar Notificaciones"}
                    </Button>
                  </div>
                )}
              </div>
              {pushError && <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded border border-red-100">{pushError}</p>}
            </CardContent>
          </Card>

          {/* Datos Personales */}
          <Card>
            <CardHeader>
              <CardTitle>Información Personal</CardTitle>
              <CardDescription>Estos datos aparecerán en los reportes y registros.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Avatar Section */}
              <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6 pb-6 border-b">
                <div className="relative group">
                  <Avatar className="w-24 h-24 border-2 border-muted">
                    <AvatarImage src={avatarUrl || ""} className="object-cover" />
                    <AvatarFallback className="text-2xl bg-slate-100">
                      {profile?.nombre?.[0]}{profile?.apellido?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <label 
                    htmlFor="avatar-upload" 
                    className="absolute bottom-0 right-0 p-1.5 bg-primary text-white rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-sm"
                    title="Cambiar foto"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  </label>
                  <input 
                    id="avatar-upload" 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleAvatarUpload}
                    disabled={uploading}
                  />
                </div>
                <div className="flex-1 space-y-1 text-center sm:text-left">
                  <h3 className="font-medium">Foto de Perfil</h3>
                  <p className="text-sm text-muted-foreground">
                    Sube una imagen para identificarte en la plataforma. Formatos: JPG, PNG.
                  </p>
                </div>
              </div>

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
            <CardContent className="space-y-6">
              
              {/* Logo Upload Section */}
              <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6 pb-6 border-b">
                <div className="relative group shrink-0">
                  <div className="w-32 h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg flex items-center justify-center bg-muted/10 overflow-hidden">
                    {companyLogoUrl ? (
                      <img src={companyLogoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                    ) : (
                      <ImageIcon className="w-10 h-10 text-muted-foreground/50" />
                    )}
                  </div>
                  <label 
                    htmlFor="logo-upload" 
                    className="absolute -bottom-2 -right-2 p-2 bg-white dark:bg-slate-800 text-primary rounded-full cursor-pointer shadow-md border hover:bg-slate-50 transition-colors"
                    title="Subir logo"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                  </label>
                  <input 
                    id="logo-upload" 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleCompanyLogoUpload}
                    disabled={uploading}
                  />
                </div>
                <div className="flex-1 space-y-1 text-center sm:text-left pt-2">
                  <h3 className="font-medium">Logo Corporativo</h3>
                  <p className="text-sm text-muted-foreground">
                    Sube el logo de tu empresa (PNG transparente recomendado). Se mostrará en la barra principal y en Mis Tareas.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Nombre de la Organización</Label>
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-muted-foreground" />
                  <Input 
                    value={orgData.nombre} 
                    onChange={(e) => setOrgData({ ...orgData, nombre: e.target.value })}
                    placeholder="Nombre de tu empresa"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Código de Tenant</Label>
                <Input value={profile?.tenants?.codigo || ''} disabled className="bg-muted font-mono" />
                <p className="text-xs text-muted-foreground">Este código identifica tu base de datos aislada. No se puede cambiar.</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateOrganization} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar Datos de Organización
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}