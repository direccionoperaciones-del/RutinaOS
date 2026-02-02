import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Building, User, Lock, Loader2, Save, Camera, UploadCloud, BellRing, Smartphone, AlertTriangle, Send, RefreshCw, CheckCircle2, Stethoscope, ShieldAlert } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function SettingsPage() {
  const { toast } = useToast();
  const { user, profile, loading: loadingProfile } = useCurrentUser();
  const { 
    isSupported, isSubscribed, subscribeToPush, runDiagnostics,
    loading: pushLoading, error: pushError, isIOS, isStandalone 
  } = usePushSubscription();
  
  const [formData, setFormData] = useState({ nombre: "", apellido: "" });
  const [orgData, setOrgData] = useState({ nombre: "" });
  const [passwordData, setPasswordData] = useState({ password: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [imgKey, setImgKey] = useState(Date.now()); // Para forzar recarga de imágenes cacheada

  // Estado Diagnóstico
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  const [runningDiag, setRunningDiag] = useState(false);

  const isDirector = profile?.role === 'director';

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
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          nombre: formData.nombre,
          apellido: formData.apellido
        })
        .eq('id', user?.id);

      if (error) throw error;
      toast({ title: "Perfil actualizado", description: "Tus datos personales han sido guardados." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateOrganization = async () => {
    if (!profile?.tenant_id || !isDirector) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ nombre: orgData.nombre })
        .eq('id', profile.tenant_id);

      if (error) throw error;
      toast({ title: "Organización actualizada", description: "El nombre de la empresa ha sido guardado." });
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

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    setUploading(true);
    
    try {
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user?.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setImgKey(Date.now());
      toast({ title: "Avatar actualizado", description: "Tu foto de perfil ha sido cambiada." });

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al subir", description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleOrgLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !profile?.tenant_id || !isDirector) return;
    setUploading(true);
    
    try {
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `org_${profile.tenant_id}.${fileExt}`;
      const filePath = `${fileName}`; 

      // Usamos un bucket específico para logos si existe
      const bucketName = 'LogoApp'; 

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('tenants')
        .update({ logo_url: publicUrl })
        .eq('id', profile.tenant_id);

      if (updateError) throw updateError;

      setOrgLogoUrl(publicUrl);
      setImgKey(Date.now());
      toast({ title: "Logo actualizado", description: "El logo de la organización ha sido cambiado." });

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al subir", description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSubscribe = async () => {
    const success = await subscribeToPush();
    if (success) toast({ title: "¡Activado!", description: "Recibirás notificaciones en este dispositivo." });
  };

  const handleRunDiagnostics = async () => {
    setDiagOpen(true);
    setRunningDiag(true);
    setDiagLogs(["Iniciando pruebas..."]);
    
    const logs = await runDiagnostics();
    setDiagLogs(logs);
    setRunningDiag(false);
  };

  const handleResetSW = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      toast({ title: "Reiniciado", description: "Sistema reseteado. Recarga la página." });
      setTimeout(() => window.location.reload(), 1000);
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

        {/* --- PESTAÑA MI CUENTA --- */}
        <TabsContent value="account" className="space-y-6 mt-6">
          
          <div className="grid gap-6 md:grid-cols-2">
            
            {/* Tarjeta Perfil */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" /> Información Personal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <Avatar className="h-20 w-20 cursor-pointer">
                      <AvatarImage src={`${avatarUrl}?t=${imgKey}`} />
                      <AvatarFallback className="text-lg bg-primary/10 text-primary">
                        {formData.nombre?.[0]}{formData.apellido?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <label 
                      htmlFor="avatar-upload" 
                      className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
                    >
                      <Camera className="w-6 h-6" />
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
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Foto de Perfil</p>
                    <p className="text-xs text-muted-foreground">Haz clic en la imagen para cambiarla.</p>
                    {uploading && <p className="text-xs text-blue-600 animate-pulse">Subiendo...</p>}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input 
                    id="nombre" 
                    value={formData.nombre} 
                    onChange={(e) => setFormData({...formData, nombre: e.target.value})} 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="apellido">Apellido</Label>
                  <Input 
                    id="apellido" 
                    value={formData.apellido} 
                    onChange={(e) => setFormData({...formData, apellido: e.target.value})} 
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input value={profile?.email} disabled className="bg-muted" />
                </div>
                <div className="grid gap-2">
                  <Label>Rol</Label>
                  <Input value={profile?.role} disabled className="bg-muted capitalize" />
                </div>
              </CardContent>
              <CardFooter className="justify-end border-t pt-4">
                <Button onClick={handleUpdateProfile} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar Cambios
                </Button>
              </CardFooter>
            </Card>

            {/* Tarjeta Seguridad & Notificaciones */}
            <div className="space-y-6">
              
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

              {/* TARJETA NOTIFICACIONES */}
              <Card className={`border ${isSubscribed ? 'bg-green-50 border-green-200' : 'bg-card border-border'}`}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BellRing className={`w-5 h-5 ${isSubscribed ? 'text-green-600' : 'text-blue-600'}`} /> 
                        Notificaciones Móviles
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">Recibe alertas en tiempo real en este dispositivo.</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleRunDiagnostics} className="h-7 text-[10px] px-2">
                            <Stethoscope className="w-3 h-3 mr-1" /> Test
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleResetSW} className="h-7 text-[10px] px-2 text-muted-foreground hover:text-red-600">
                            <RefreshCw className="w-3 h-3" />
                        </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 text-sm text-muted-foreground">
                      <Smartphone className="w-8 h-8 opacity-50 shrink-0" />
                      <div>
                        {!isSupported ? (
                          <p className="text-red-500 font-medium">Navegador no compatible.</p>
                        ) : isIOS && !isStandalone ? (
                          <div className="text-orange-600 bg-orange-50 p-2 rounded border border-orange-200 text-xs">
                            <p className="font-bold mb-1">Requiere instalación (iOS):</p>
                            <p>Usa el botón "Compartir" {'>'} "Agregar a Inicio".</p>
                          </div>
                        ) : isSubscribed ? (
                          <p className="text-green-700 font-medium flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600"/>
                            Dispositivo conectado.
                          </p>
                        ) : (
                          <p>Activa las notificaciones para recibir alertas de tareas y mensajes.</p>
                        )}
                      </div>
                    </div>

                    {isSupported && !(isIOS && !isStandalone) && !isSubscribed && (
                      <Button onClick={handleSubscribe} disabled={pushLoading} className="w-full h-8 text-xs">
                        {pushLoading && <Loader2 className="w-3 h-3 mr-2 animate-spin" />} Activar Notificaciones
                      </Button>
                    )}
                    
                    {pushError && (
                      <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                        Error: {pushError}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        </TabsContent>

        {/* --- PESTAÑA ORGANIZACIÓN --- */}
        <TabsContent value="organization" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="w-4 h-4 text-primary" /> Información de la Organización
              </CardTitle>
              <CardDescription>
                Estos datos aparecen en los reportes y en el encabezado de la aplicación.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {!isDirector && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center gap-2 text-sm text-blue-800">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Solo el <strong>Director</strong> puede modificar estos datos.</span>
                </div>
              )}

              {/* Logo Upload */}
              <div className={`flex flex-col items-center gap-4 sm:flex-row p-4 border rounded-lg bg-muted/20 ${!isDirector ? 'opacity-70 pointer-events-none' : ''}`}>
                <div className="relative group shrink-0">
                  <div className="h-24 w-24 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-white">
                    {orgLogoUrl ? (
                      <img src={`${orgLogoUrl}?t=${imgKey}`} alt="Logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <Building className="h-8 w-8 text-muted-foreground opacity-20" />
                    )}
                  </div>
                  
                  {isDirector && (
                    <label 
                      htmlFor="org-logo-upload" 
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-lg text-white text-xs font-medium"
                    >
                      <Camera className="w-4 h-4 mr-1" /> Cambiar
                    </label>
                  )}
                  
                  <input 
                    id="org-logo-upload" 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleOrgLogoUpload}
                    disabled={uploading || !isDirector}
                  />
                </div>
                <div className="space-y-1 text-center sm:text-left flex-1">
                  <h4 className="font-medium text-sm">Logotipo Corporativo</h4>
                  <p className="text-xs text-muted-foreground">Se recomienda formato PNG con fondo transparente. Tamaño máx: 2MB.</p>
                  {uploading && <p className="text-xs text-blue-600 animate-pulse font-medium">Subiendo imagen...</p>}
                </div>
              </div>

              {/* Organization Name */}
              <div className="space-y-2">
                <Label>Nombre de la Empresa</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Building className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      value={orgData.nombre} 
                      onChange={(e) => setOrgData({...orgData, nombre: e.target.value})} 
                      className="pl-9" 
                      placeholder="Nombre de tu empresa"
                      disabled={!isDirector}
                    />
                  </div>
                  {isDirector && (
                    <Button onClick={handleUpdateOrganization} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </div>

              {isDirector && (
                <div className="p-4 bg-yellow-50 text-yellow-800 rounded-md text-xs border border-yellow-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    Si eres el <strong>Director</strong>, los cambios realizados aquí afectarán a todos los usuarios de la organización.
                  </p>
                </div>
              )}

            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL DE DIAGNÓSTICO */}
      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Stethoscope className="w-5 h-5"/> Diagnóstico de Notificaciones</DialogTitle>
                <DialogDescription>Prueba de conexión extremo a extremo.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[300px] w-full bg-slate-950 text-green-400 p-4 rounded-md font-mono text-xs">
                {diagLogs.map((log, i) => (
                    <div key={i} className="mb-1 border-b border-white/10 pb-1 last:border-0">
                        {log.includes('❌') || log.includes('⚠️') ? <span className="text-red-400">{log}</span> : log}
                    </div>
                ))}
                {runningDiag && <div className="animate-pulse text-blue-400">Ejecutando pruebas...</div>}
            </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}