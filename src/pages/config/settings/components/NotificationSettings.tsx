import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { BellRing, Smartphone, Stethoscope, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { usePushSubscription } from "@/hooks/use-push-subscription";

export function NotificationSettings() {
  const { toast } = useToast();
  const { 
    isSupported, isSubscribed, subscribeToPush, runDiagnostics,
    loading, error, isIOS, isStandalone 
  } = usePushSubscription();

  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  const [runningDiag, setRunningDiag] = useState(false);

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

  return (
    <>
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
              <Button onClick={handleSubscribe} disabled={loading} className="w-full h-8 text-xs">
                {loading && <Loader2 className="w-3 h-3 mr-2 animate-spin" />} Activar Notificaciones
              </Button>
            )}
            
            {error && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                Error: {error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
    </>
  );
}