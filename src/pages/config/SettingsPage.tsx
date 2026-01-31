import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Building, User, Lock, Loader2, Save, Camera, UploadCloud, Image as ImageIcon, BellRing, Smartphone, AlertTriangle, Send } from "lucide-react";
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
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFormData({ nombre: profile.nombre || "", apellido: profile.apellido || "" });
      setAvatarUrl(profile.avatar_url);
      if (profile.tenants) {
        setCompanyLogoUrl(profile.tenants.logo_url);
        setOrgData({ nombre: profile.tenants.nombre });
      }
    }
  }, [profile]);

  // ... (Funciones de perfil/org existentes se mantienen igual) ...
  const handleUpdateProfile = async () => { /* ... */ }; // Mantener lógica existente
  const handleUpdateOrganization = async () => { /* ... */ }; // Mantener lógica existente
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => { /* ... */ }; // Mantener lógica existente
  const handleCompanyLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => { /* ... */ }; // Mantener lógica existente
  const handleChangePassword = async () => { /* ... */ }; // Mantener lógica existente

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

        <TabsContent value="account" className="space-y-6">
          
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

          {/* Resto del contenido existente... (Avatar, Datos, Password) */}
          {/* ... (código existente del formulario de perfil y password) ... */}
          <Card>
            <CardHeader><CardTitle>Información Personal</CardTitle></CardHeader>
            <CardContent className="space-y-6">
               {/* ... (mantener código existente) ... */}
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
        </TabsContent>

        <TabsContent value="organization">
           {/* ... (mantener código existente de organización) ... */}
           <Card>
            <CardHeader><CardTitle>Datos de la Empresa</CardTitle></CardHeader>
            <CardContent>
               <div className="space-y-2"><Label>Nombre de la Organización</Label><div className="flex items-center gap-2"><Building className="w-4 h-4 text-muted-foreground" /><Input value={orgData.nombre} onChange={(e) => setOrgData({ ...orgData, nombre: e.target.value })} /></div></div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateOrganization} disabled={saving}>Guardar</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}