import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { calculateDistance } from "@/utils/geo";

interface LocationStepProps {
  pdv: any;
  required: boolean;
  onLocationVerified: (lat: number, lng: number, valid: boolean, accuracy: number) => void;
}

export function LocationStep({ pdv, required, onLocationVerified }: LocationStepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number, accuracy: number} | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  const pdvRadio = pdv?.radio_gps || 100;

  const getLocation = () => {
    setIsLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocalización no soportada.");
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        
        setCurrentLocation({ lat, lng, accuracy });

        if (pdv?.latitud && pdv?.longitud) {
          const dist = calculateDistance(lat, lng, pdv.latitud, pdv.longitud);
          setDistance(Math.round(dist));
          
          const valid = dist <= pdvRadio;
          setIsValid(valid);
          onLocationVerified(lat, lng, valid, accuracy);
          
          if (!valid) {
            setError(`Estás a ${Math.round(dist)}m. Máximo: ${pdvRadio}m.`);
          }
        } else {
          if (required) {
            setError("El PDV no tiene coordenadas configuradas.");
            onLocationVerified(lat, lng, false, accuracy);
          }
        }
        setIsLoading(false);
      },
      (err) => {
        console.error(err);
        setError("No se pudo obtener ubicación.");
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (!required) return null;

  return (
    <div className={`p-4 rounded-lg border ${isValid ? 'bg-green-50 border-green-200' : 'bg-muted/50'}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold flex items-center gap-2 text-sm">
          <MapPin className="w-4 h-4" /> Validación de Ubicación
        </h4>
        <Badge variant="destructive" className="text-[10px] h-5">Requerido</Badge>
      </div>
      
      <div className="text-sm text-muted-foreground mb-4">
        {currentLocation ? (
          <>
            <p>Posición: {currentLocation.lat.toFixed(5)}, {currentLocation.lng.toFixed(5)}</p>
            <p className="text-xs">Precisión: ±{Math.round(currentLocation.accuracy)}m</p>
            {distance !== null && <p className="font-medium mt-1">Distancia: {distance}m</p>}
          </>
        ) : (
          <p>Valida tu presencia en el punto de venta.</p>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm mb-3 font-medium bg-destructive/10 p-2 rounded">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {isValid ? (
         <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
           <CheckCircle2 className="w-4 h-4" /> Ubicación Válida
         </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={getLocation} disabled={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <MapPin className="w-4 h-4 mr-2"/>}
          Validar Ubicación
        </Button>
      )}
    </div>
  );
}