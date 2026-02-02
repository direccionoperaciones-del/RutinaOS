import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Building, User, Lock, Loader2, Save, Camera, UploadCloud, BellRing, Smartphone, AlertTriangle, Send, RefreshCw, CheckCircle2 } from "lucide-react";
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
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  
  // Estado para forzar recarga de imágenes (cache busting)
  const [imgKey, setImgKey] = useState(Date.now());

  useEffect(() => {
    if (profile) {
      setFormData({ nombre: profile.nombre || "", apellido: profile.apellido || "" });
      setAvatarUrl(profile.avatar_url);
      if (profile.tenants) {
        setOrgData({ nombre: profile.tenants.nombre });
        setOrgLogoUrl(profile.tenants.logo_url);
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
      const { error } = await supabase.from('profiles').update({ nombre: formData.nombre, apellido: formData.apellido }).eq('id', profile.id);
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
    setSaving(true);
    try {
      const { error } = await supabase.from('tenants').update({ nombre: orgData.nombre }).eq('id', profile.tenant_id);
      if (error) throw error;
      toast({ title: "Organización actualizada", description: "Datos guardados." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.password !== passwordData.confirm) return toast({ variant: "destructive", title: "Error", description: "Las contraseñas no coinciden." });
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordData.password });
      if (error) throw error;
      toast({ title: "Contraseña actualizada", description: "Cambio exitoso." });
      setPasswordData({ password: "", confirm: "" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;
      if (!profile) return;
      const file = event.target.files[0];
      const filePath = `${profile.id}/${Math.random()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      if (data) {
          const { error: updateError } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id);
          if (updateError) throw updateError;
          setAvatarUrl(data.publicUrl);
          setImgKey(Date.now());
          toast({ title: "Foto actualizada", description: "Tu perfil se ha actualizado." });
          setTimeout(() => window.location.reload(), 1000); 
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleOrgLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;
      if (!profile?.tenant_id) return;
      
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `tenants/${profile.tenant_id}/logo_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
      
      if (uploadError) {
         console.error("Upload error:", uploadError);
         throw new Error("No se pudo subir la imagen. Verifica permisos.");
      }
      
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      if (data) {
          const { error: updateError } = await supabase.from('tenants').update({ logo_url: data.publicUrl }).eq('id', profile.tenant_id);
          if (updateError) throw updateError;
          setOrgLogoUrl(data.publicUrl);
          setImgKey(Date.now());
          toast({ title: "Logo actualizado", description: "El cambio se reflejará en toda la aplicación." });
          setTimeout(() => window.location.reload(), 1500); 
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al subir", description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSubscribe = async () => {
    const success = await subscribeToPush();
    if (success) {
      toast({ title: "¡Activado!", description: "Recibirás notificaciones en este dispositivo." });
    }
  };

  const handleTestPush = async () => {
    const success = await sendTestPush();
    if (success) {
      toast({ 
        title: "Enviado", 
        description: "La notificación debería llegar en unos segundos.",
        className: "bg-green-50 border-green-200"
      });
    } else {
      // El error ya se maneja en el hook, pero podemos dar feedback extra si fue por llaves
      toast({ 
        variant: "destructive",
        title: "Error de envío", 
        description: "Hubo un problema enviando la alerta. Si cambiaste las llaves VAPID recientemente, usa el botón 'Resetear'." 
      });
    }
  };

  const handleResetSW = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      // Limpiar suscripciones locales si las hubiere
      toast({ title: "Reiniciado", description: "Sistema de notificaciones reiniciado. Vuelve a activar las notificaciones." });
      setTimeout(() => window.location.reload(), 1500);
    }
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
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BellRing className={`w-5 h-5 ${isSubscribed ? 'text-green-600' : 'text-blue-600'}`} /> 
                    Notificaciones Móviles
                  </CardTitle>
                  <CardDescription>Alertas en tiempo real sobre tareas y mensajes.</CardDescription>
                </div>
                {isSubscribed && (
                  <Button variant="ghost" size="sm" onClick={handleResetSW} title="Si no recibes notificaciones, reinicia aquí" className="text-xs text-muted-foreground h-6 hover:text-red-600">
                    <RefreshCw className="w-3 h-3 mr-1" /> Resetear
                  </Button>
                )}
              </div>
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
                        <CheckCircle2 className="w-4 h-4 text-green-600"/>
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
                        {pushLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} 
                        Probar Envío
                      </Button>
                    )}
                  </div>
                )}
                
                {pushError && (
                  <div className="flex flex-col gap-2 text-xs bg-red-50 p-3 rounded border border-red-200">
                    <div className="flex items-center gap-2 text-red-700 font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Error de conexión:</span>
                    </div>
                    <p className="text-red-600 pl-6">{pushError}</p>
                    
                    {/* Sugerencia inteligente si parece ser un error de llaves */}
                    {(pushError.includes('VAPID') || pushError.includes('desincronización') || pushError.includes('llaves')) && (
                        <div className="mt-2 pl-6">
                            <Button size="sm" variant="destructive" onClick={handleResetSW} className="h-7 text-xs">
                                <RefreshCw className="w-3 h-3 mr-1"/> Reiniciar Conexión (Recomendado)
                            </Button>
                        </div>
                    )}
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
                  <Avatar className="w-24 h-24 border-2 border-muted bg-white">
                    <AvatarImage src={`${avatarUrl}?t=${imgKey}`} className="object-cover" />
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

        <TabsContent value="organization" className="space-y-6 mt-6">
           <Card>
            <CardHeader>
              <CardTitle>Datos de la Empresa</CardTitle>
              <CardDescription>Información e identidad visual.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
               <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6 pb-6 border-b">
                <div className="relative group">
                  <div className="h-24 w-24 rounded-lg border-2 border-dashed border-muted bg-white flex items-center justify-center overflow-hidden">
                    {orgLogoUrl ? (
                      <img src={`${orgLogoUrl}?t=${imgKey}`} alt="Logo Organización" className="h-full w-full object-contain" />
                    ) : (
                      <Building className="h-8 w-8 text-muted-foreground/50" />
                    )}
                  </div>
                  <label htmlFor="org-logo-upload" className="absolute -bottom-2 -right-2 p-2 bg-primary text-white rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-md">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                  </label>
                  <input id="org-logo-upload" type="file" accept="image/*" className="hidden" onChange={handleOrgLogoUpload} disabled={uploading} />
                </div>
                <div className="flex-1 space-y-1 text-center sm:text-left">
                  <h3 className="font-medium">Logo de la Organización</h3>
                  <p className="text-sm text-muted-foreground">Este logo aparecerá en el menú y reportes.</p>
                </div>
              </div>

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