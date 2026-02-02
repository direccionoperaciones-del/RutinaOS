character">
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Building, User, Lock, Loader2, Save, Camera, UploadCloud, BellRing, Smartphone, AlertTriangle, Send, RefreshCw, CheckCircle2, Stethoscope } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function SettingsPage() {
  const { toast } = useToast();
  const { profile, loading: loadingProfile } = useCurrentUser();
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
  const [imgKey, setImgKey] = useState(Date.now());

  // Estado Diagnóstico
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  const [runningDiag, setRunningDiag] = useState(false);

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

  const handleUpdateProfile = async () => { /* ... (Sin cambios) ... */ };
  const handleUpdateOrganization = async () => { /* ... (Sin cambios) ... */ };
  const handleChangePassword = async () => { /* ... (Sin cambios) ... */ };
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => { /* ... (Sin cambios) ... */ };
  const handleOrgLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => { /* ... (Sin cambios) ... */ };

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

        <TabsContent value="account" className="space-y-6 mt-6">
          
          {/* TARJETA NOTIFICACIONES MEJORADA */}
          <Card className={`border ${isSubscribed ? 'bg-green-50 border-green-200' : 'bg-card border-border'}`}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BellRing className={`w-5 h-5 ${isSubscribed ? 'text-green-600' : 'text-blue-600'}`} /> 
                    Notificaciones Móviles
                  </CardTitle>
                  <CardDescription>Alertas en tiempo real.</CardDescription>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleRunDiagnostics} className="h-8 text-xs">
                        <Stethoscope className="w-3 h-3 mr-1" /> Diagnóstico
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleResetSW} className="h-8 text-xs text-muted-foreground hover:text-red-600">
                        <RefreshCw className="w-3 h-3 mr-1" /> Reset
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
                        Activas y listas.
                      </p>
                    ) : (
                      <p>Activa las notificaciones para recibir alertas.</p>
                    )}
                  </div>
                </div>

                {isSupported && !(isIOS && !isStandalone) && !isSubscribed && (
                  <Button onClick={handleSubscribe} disabled={pushLoading} className="w-full sm:w-auto">
                    {pushLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Activar Ahora
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

          {/* ... Resto de componentes (Perfil, Contraseña) ... */}
          {/* Se mantienen igual para ahorrar espacio en la respuesta, pero el componente completo debe incluirlos */}
          
        </TabsContent>
        <TabsContent value="organization">
            {/* ... Contenido organización ... */}
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