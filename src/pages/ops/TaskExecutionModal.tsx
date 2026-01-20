import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { calculateDistance } from "@/utils/geo";
import { MapPin, Camera, CheckCircle2, XCircle, AlertTriangle, Loader2, UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface TaskExecutionModalProps {
  task: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function TaskExecutionModal({ task, open, onOpenChange, onSuccess }: TaskExecutionModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Estados de ejecución
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isGpsValid, setIsGpsValid] = useState(false);
  const [comentario, setComentario] = useState("");
  
  // Configuración de la rutina
  const rutina = task?.routine_templates;
  const pdv = task?.pdv;
  
  const requiresGps = rutina?.gps_obligatorio;
  const pdvRadio = pdv?.radio_gps || 100;

  useEffect(() => {
    if (open) {
      // Reset states
      setCurrentLocation(null);
      setDistance(null);
      setGpsError(null);
      setIsGpsValid(!requiresGps); // Si no requiere GPS, es válido por defecto
      setComentario("");
    }
  }, [open, requiresGps]);

  const getLocation = () => {
    setIsLoading(true);
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError("Tu navegador no soporta geolocalización.");
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        
        setCurrentLocation({ lat: userLat, lng: userLng });

        if (pdv?.latitud && pdv?.longitud) {
          const dist = calculateDistance(userLat, userLng, pdv.latitud, pdv.longitud);
          setDistance(Math.round(dist));
          
          if (dist <= pdvRadio) {
            setIsGpsValid(true);
            toast({ title: "Ubicación verificada", description: "Estás dentro del rango permitido." });
          } else {
            setIsGpsValid(false);
            setGpsError(`Estás a ${Math.round(dist)}m del PDV. Máximo permitido: ${pdvRadio}m.`);
          }
        } else {
          // Si el PDV no tiene coordenadas pero la rutina pide GPS, es un error de configuración
          if (requiresGps) {
            setGpsError("El PDV no tiene coordenadas configuradas.");
            setIsGpsValid(false);
          }
        }
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        setGpsError("No se pudo obtener tu ubicación. Verifica los permisos.");
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleComplete = async () => {
    if (requiresGps && !isGpsValid) {
      toast({ variant: "destructive", title: "Bloqueo de seguridad", description: "Debes validar tu ubicación GPS antes de finalizar." });
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Actualizar la tarea
      const { error } = await supabase
        .from('task_instances')
        .update({
          estado: 'completada', // En V2 esto podría calcularse si es a tiempo o vencida
          completado_at: new Date().toISOString(),
          completado_por: user.id,
          gps_latitud: currentLocation?.lat,
          gps_longitud: currentLocation?.lng,
          gps_en_rango: isGpsValid,
          // Aquí iría el comentario si agregamos el campo a la tabla en el futuro,
          // por ahora lo simulamos o lo guardamos en un log aparte si fuera necesario.
          // Para V1 MVP, asumimos que se guarda en la tabla si existe campo 'comentario' (que no está en el esquema actual estricto pero es buena práctica)
        })
        .eq('id', task.id);

      if (error) throw error;

      toast({ title: "¡Tarea Completada!", description: "La ejecución se ha registrado exitosamente." });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="capitalize">{rutina.prioridad}</Badge>
            <span className="text-xs text-muted-foreground">{task.fecha_programada}</span>
          </div>
          <DialogTitle>{rutina.nombre}</DialogTitle>
          <DialogDescription>
            {rutina.descripcion}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* SECCIÓN 1: GPS */}
          <div className={`p-4 rounded-lg border ${isGpsValid ? 'bg-green-50 border-green-200' : 'bg-muted/50'}`}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Validación de Ubicación
              </h4>
              {requiresGps && <Badge variant="secondary">Obligatorio</Badge>}
            </div>
            
            <div className="text-sm text-muted-foreground mb-4">
              {currentLocation ? (
                <>
                  <p>Detectado: {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}</p>
                  {distance !== null && <p className="font-medium mt-1">Distancia al PDV: {distance} metros</p>}
                </>
              ) : (
                <p>Se requiere tu ubicación actual para validar la presencia en el PDV.</p>
              )}
            </div>

            {gpsError && (
              <div className="flex items-center gap-2 text-destructive text-sm mb-3 font-medium bg-destructive/10 p-2 rounded">
                <AlertTriangle className="w-4 h-4" />
                {gpsError}
              </div>
            )}

            {isGpsValid ? (
               <div className="flex items-center gap-2 text-green-700 font-medium">
                 <CheckCircle2 className="w-5 h-5" />
                 Ubicación Válida
               </div>
            ) : (
              <Button 
                type="button" 
                variant={requiresGps ? "default" : "secondary"} 
                size="sm" 
                onClick={getLocation}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <MapPin className="w-4 h-4 mr-2"/>}
                Validar Ubicación
              </Button>
            )}
          </div>

          {/* SECCIÓN 2: EVIDENCIA (Simulada por ahora) */}
          <div className="p-4 rounded-lg border bg-muted/20">
             <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Evidencia Fotográfica
              </h4>
              <Badge variant="outline">Opcional V1</Badge>
            </div>
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-6 bg-background">
              <UploadCloud className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground text-center">
                La subida de fotos estará disponible en la siguiente actualización.
              </p>
            </div>
          </div>

          {/* SECCIÓN 3: COMENTARIOS */}
          <div className="space-y-2">
            <Label>Notas de ejecución</Label>
            <Textarea 
              placeholder="¿Alguna novedad o incidencia durante la rutina?"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={handleComplete} 
            disabled={isLoading || (requiresGps && !isGpsValid)}
            className={isGpsValid || !requiresGps ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Finalizar Tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}