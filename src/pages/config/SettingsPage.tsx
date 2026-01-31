import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Building, User, Lock, Loader2, Save, Camera, UploadCloud, BellRing, Smartphone, AlertTriangle, Send } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePushSubscription } from "@/hooks/use-push-subscription";

export default function SettingsPage() {
  const { toast } = useToast();
  const { profile, loading: loadingProfile } = useCurrentUser();
  const { 
    isSupported, isSubscribed, subscribeToPush, sendTestPush, 
    loading: pushLoading, error: pushError, isIOS, isStandalone 
  } = usePushSubscription();
  
  const [formData, setFormData] = useState({ nombre: "", apellido: "" });
  const [orgData, setOrgData] = useState({ nombre: "" });
  const [passwordData, setPasswordData] = useState({ password: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFormData({ nombre: profile.nombre || "", apellido: profile.apellido || "" });
      setAvatarUrl(profile.avatar_url);
      if (profile.tenants) {
        setOrgData({ nombre: profile.tenants.nombre });
      }
    }
  }, [profile]);

  const handleUpdateProfile = async () => {
    if (!profile) return;
    if (!formData.nombre || !formData.apellido) {
      toast({ variant: "destructive", title: "Campos requeridos", description: "Nombre y Apellido son obligatorios." });
      return;
    }

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

  const handleUpdateOrganization = async () => {
    if (!profile?.tenant_id) return;
    if (!orgData.nombre) {
      toast({ variant: "destructive", title: "Requerido", description: "El nombre de la empresa es obligatorio." });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ nombre: orgData.nombre })
        .eq('id', profile.tenant_id);

      if (error) throw error;
      toast({ title: "Organización actualizada", description: "Los datos de la empresa han sido guardados." });
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
        return;
      }

      if (!profile) return;

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${profile.id}/${Math.random()}.${fileExt}`;

      // 1. Subir al bucket avatars
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Obtener URL pública
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      if (data) {
          // 3. Actualizar perfil
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ avatar_url: data.publicUrl })
            .eq('id', profile.id);
            
          if (updateError) throw updateError;
          
          setAvatarUrl(data.publicUrl);
          toast({ title: "Foto actualizada", description: "Tu foto de perfil se ha guardado." });
          
          // Recargar para que el header tome el cambio
          setTimeout(() => window.location.reload(), 1500); 
      }
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error subiendo imagen", description: error.message });
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
      const { error } = await supabase.auth.updateUser({ password: passwordData.password });
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
      toast({ title: "¡Activado!", description: "Recibirás notificaciones en este dispositivo." });
    }
  };

  const handleTestPush = async () => {
    await sendTestPush();
    toast({ title: "Enviado", description: "Se ha enviado una notificación de prueba." });
  };

  if (loadingProfile) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Ajustes y Perfil</h2>
        <p className="text-muted-foreground">Gestiona tu información personal y notificaciones.</p>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="account">Mi Cuenta</TabsTrigger>
          <TabsTrigger value="organization">Organización</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-6 mt-6">
          
          {/* TARJETA DE NOTIFICACIONES */}
          <Card className={`border ${isSubscribed ? 'bg-green-50 border-green-200' : 'bg-card border-border'}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className={`w-5 h-5 ${isSubscribed ? 'text-green-600' : 'text-blue-600'}`} /> 
                Notificaciones Móviles
              </CardTitle>
              <CardDescription>Alertas en tiempo real sobre tareas y mensajes.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Smartphone className="w-8 h-8 opacity-50 shrink-0" />
                  <div>
                    {!isSupported ? (
                      <p className="text-red-500 font-medium">Tu navegador no soporta notificaciones Web Push.</p>
                    ) : isIOS && !isStandalone ? (
                      <div className="text-orange-600 bg-orange-50 p-2 rounded border border-orange-200">
                        <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> Atención iPhone/iPad:</p>
                        <p>Para activar notificaciones, debes instalar la app:</p>
                        <ol className="list-decimal ml-4 mt-1 space-y-1">
                          <li>Toca el botón <strong>Compartir</strong> <span className="text-xl">⎋</span></li>
                          <li>Selecciona <strong>"Agregar a Inicio"</strong></li>
                          <li>Abre la app desde el nuevo icono</li>
                        </ol>
                      </div>
                    ) : isSubscribed ? (
                      <p className="text-green-700 font-medium flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"/>
                        Dispositivo conectado y recibiendo alertas.
                      </p>
                    ) : (
                      <p>Activa las notificaciones para no perderte tareas urgentes ni comunicados.</p>
                    )}
                  </div>
                </div>

                {isSupported && !(isIOS && !isStandalone) && (
                  <div className="flex gap-3">
                    <Button 
                      onClick={handleSubscribe} 
                      disabled={isSubscribed || pushLoading} 
                      className={isSubscribed ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                    >
                      {pushLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {isSubscribed ? "Suscripción Activa" : "Activar Notificaciones"}
                    </Button>
                    
                    {isSubscribed && (
                      <Button variant="outline" onClick={handleTestPush} disabled={pushLoading}>
                        <Send className="w-4 h-4 mr-2" /> Probar
                      </Button>
                    )}
                  </div>
                )}
                
                {pushError && (
                  <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    <strong>Error:</strong> {pushError}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* DATOS PERSONALES */}
          <Card>
            <CardHeader><CardTitle>Información Personal</CardTitle></CardHeader>
            <CardContent className="space-y-6">
               <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6 pb-6 border-b">
                <div className="relative group">
                  <Avatar className="w-24 h-24 border-2 border-muted">
                    <AvatarImage src={avatarUrl || ""} className="object-cover" />
                    <AvatarFallback className="text-2xl bg-slate-100">{profile?.nombre?.[0]}{profile?.apellido?.[0]}</AvatarFallback>
                  </Avatar>
                  <label htmlFor="avatar-upload" className="absolute bottom-0 right-0 p-1.5 bg-primary text-white rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-sm">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  </label>
                  <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
                </div>
                <div className="flex-1 space-y-1 text-center sm:text-left">
                  <h3 className="font-medium">Foto de Perfil</h3>
                  <p className="text-sm text-muted-foreground">Sube una imagen para identificarte en la plataforma.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nombre</Label><Input value={formData.nombre} onChange={(e) => setFormData({...formData, nombre: e.target.value})} /></div>
                <div className="space-y-2"><Label>Apellido</Label><Input value={formData.apellido} onChange={(e) => setFormData({...formData, apellido: e.target.value})} /></div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateProfile} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar</Button>
            </CardFooter>
          </Card>

          {/* CAMBIO DE CONTRASEÑA */}
          <Card>
            <CardHeader>
              <CardTitle>Seguridad</CardTitle>
              <CardDescription>Actualiza tu contraseña de acceso.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nueva Contraseña</Label>
                  <Input type="password" value={passwordData.password} onChange={(e) => setPasswordData({...passwordData, password: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Confirmar Contraseña</Label>
                  <Input type="password" value={passwordData.confirm} onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})} />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleChangePassword} disabled={saving} variant="outline"><Lock className="w-4 h-4 mr-2"/> Actualizar Contraseña</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="organization" className="mt-6">
           <Card>
            <CardHeader>
              <CardTitle>Datos de la Empresa</CardTitle>
              <CardDescription>Información general de tu organización.</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="space-y-2">
                 <Label>Nombre de la Organización</Label>
                 <div className="flex items-center gap-2">
                   <Building className="w-4 h-4 text-muted-foreground" />
                   <Input value={orgData.nombre} onChange={(e) => setOrgData({ ...orgData, nombre: e.target.value })} />
                 </div>
               </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateOrganization} disabled={saving}>Guardar Cambios</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}