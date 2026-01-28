import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, Loader2, Camera, Paperclip, FileText, Trash2, X, Aperture } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface EvidenceStepProps {
  type: 'foto' | 'archivo';
  label: string;
  required: boolean;
  minCount?: number;
  files: any[];
  isUploading: boolean;
  onFilesAdded: (files: File[]) => void;
  onDelete: (id: string, path: string) => void;
}

export function EvidenceStep({ 
  type, 
  label, 
  required, 
  minCount = 0, 
  files, 
  isUploading, 
  onFilesAdded, 
  onDelete 
}: EvidenceStepProps) {
  
  const isPhoto = type === 'foto';
  const Icon = isPhoto ? Camera : Paperclip;
  
  // Estados para cámara
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('evidence').getPublicUrl(path);
    return data.publicUrl;
  };

  // Manejar selección de archivos input tradicional
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesAdded(Array.from(e.target.files));
      e.target.value = ''; // Reset
    }
  };

  // --- LÓGICA DE CÁMARA ---
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Preferir cámara trasera en móviles
      });
      setStream(mediaStream);
      setIsCameraOpen(true);
      
      // Esperar a que el ref del video esté disponible
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("No se pudo acceder a la cámara. Por favor verifica los permisos.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
  };

  const takePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const fileName = `foto_camara_${Date.now()}.jpg`;
            const file = new File([blob], fileName, { type: "image/jpeg" });
            onFilesAdded([file]);
            stopCamera();
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  return (
    <div className="p-4 rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold flex items-center gap-2 text-sm">
          <Icon className="w-4 h-4" /> {label}
        </h4>
        {required ? (
          <Badge variant="destructive" className="text-[10px]">
            {isPhoto && minCount > 0 ? `Mínimo ${minCount}` : 'Requerido'}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] bg-background">Opcional</Badge>
        )}
      </div>
      
      <div className="space-y-4">
        
        {/* VISTA DE CÁMARA ACTIVA */}
        {isCameraOpen ? (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[3/4] md:aspect-video flex items-center justify-center">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
            
            <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-6 pb-2">
              <Button 
                variant="destructive" 
                size="icon" 
                className="rounded-full h-12 w-12"
                onClick={stopCamera}
              >
                <X className="w-6 h-6" />
              </Button>
              
              <Button 
                variant="default" 
                size="icon" 
                className="rounded-full h-16 w-16 border-4 border-white bg-transparent hover:bg-white/20"
                onClick={takePhoto}
              >
                <div className="h-12 w-12 bg-white rounded-full" />
              </Button>
            </div>
          </div>
        ) : (
          /* BOTONES DE ACCIÓN */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isPhoto && (
              <Button 
                variant="outline" 
                className="h-24 flex flex-col gap-2 border-dashed border-2 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                onClick={startCamera}
                disabled={isUploading}
              >
                <Camera className="w-8 h-8 text-blue-500" />
                <span className="text-xs font-medium text-blue-700">Tomar Foto</span>
              </Button>
            )}

            <label 
              className={`flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-md cursor-pointer bg-background hover:bg-muted/50 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <div className="flex flex-col items-center justify-center pt-2">
                {isUploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                ) : (
                  <UploadCloud className="w-8 h-8 text-muted-foreground mb-2" />
                )}
                <p className="text-xs text-muted-foreground font-medium">
                  {isUploading ? "Subiendo..." : "Subir Archivo / Galería"}
                </p>
              </div>
              <input 
                type="file" 
                accept={isPhoto ? "image/*" : ".pdf,.doc,.docx,.xls,.xlsx,.txt"} 
                className="hidden" 
                multiple // Permitir selección múltiple
                onChange={handleFileChange} 
                disabled={isUploading} 
              />
            </label>
          </div>
        )}

        {/* File List / Grid */}
        {files.length > 0 && (
          <div className={isPhoto ? "grid grid-cols-3 gap-2 mt-4" : "space-y-2 mt-4"}>
            {files.map(file => (
              isPhoto ? (
                // Photo Item
                <div key={file.id} className="relative group aspect-square rounded-md overflow-hidden border bg-background shadow-sm">
                  <img 
                    src={getPublicUrl(file.storage_path)} 
                    className="object-cover w-full h-full" 
                    alt="Evidencia"
                  />
                  <button 
                    onClick={() => onDelete(file.id, file.storage_path)}
                    className="absolute top-1 right-1 bg-red-500/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                // File Item
                <div key={file.id} className="flex items-center justify-between p-2 bg-background border rounded text-sm">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span className="truncate max-w-[200px]">{file.filename}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-destructive"
                    onClick={() => onDelete(file.id, file.storage_path)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}