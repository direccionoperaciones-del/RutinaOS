import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, Loader2, Camera, Paperclip, FileText, Trash2, X, Eye, AlertCircle, RefreshCw, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { validateFileSecurity } from "@/utils/file-validation";
import { useToast } from "@/hooks/use-toast";

// --- SUB-COMPONENTE ROBUSTO PARA MINIATURAS ---
interface EvidenceThumbnailProps {
  file: any; // Objeto de evidencia (puede tener fileObject o storage_path)
}

const EvidenceThumbnail = ({ file }: EvidenceThumbnailProps) => {
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;

    const loadPreview = async () => {
      setLoading(true);
      setError(false);

      try {
        // CASO 1: Preview Inmediato (Archivo local recién seleccionado)
        if (file.fileObject) {
          objectUrl = URL.createObjectURL(file.fileObject);
          if (isMounted) {
            setUrl(objectUrl);
            setLoading(false);
          }
          return;
        }

        // CASO 2: Archivo remoto (Ya guardado en Supabase)
        if (file.storage_path) {
          // Generar URL firmada (validez 1 hora)
          const { data, error } = await supabase.storage
            .from('evidence')
            .createSignedUrl(file.storage_path, 3600);

          if (error) throw error;
          
          if (isMounted && data?.signedUrl) {
            setUrl(data.signedUrl);
          } else {
            throw new Error("No se pudo generar la URL firmada");
          }
        }
      } catch (err) {
        console.error("Error cargando imagen:", err);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPreview();

    // Cleanup para evitar memory leaks con blobs
    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.storage_path, file.fileObject]); // Recargar si cambia el path o el archivo

  // Renderizado de Estados
  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 animate-pulse">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mb-1"/>
        <span className="text-[9px] text-muted-foreground">Cargando...</span>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 text-red-500 gap-1 p-2 border border-red-100">
        <ImageOff className="w-6 h-6 opacity-50" />
        <span className="text-[9px] text-center font-bold leading-tight">No disponible</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full group">
      <img 
        src={url} 
        className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105 bg-gray-100" 
        alt="Evidencia"
        onError={() => setError(true)}
      />
      
      {/* Overlay con acciones */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="p-2 bg-white/90 text-slate-800 rounded-full hover:bg-white shadow-lg transition-transform hover:scale-110"
          title="Ver original"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="w-4 h-4" />
        </a>
      </div>
      
      {/* Badge de "Subiendo..." si aplica */}
      {file.isUploading && (
        <div className="absolute bottom-0 left-0 right-0 bg-blue-600/90 text-white text-[9px] py-0.5 text-center font-medium">
          Subiendo...
        </div>
      )}
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---

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
  const { toast } = useToast();
  
  const isPhoto = type === 'foto';
  const Icon = isPhoto ? Camera : Paperclip;
  
  // Estados para cámara
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Manejar input de archivo (Galería/Archivos)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const validFiles: File[] = [];
      
      for (const file of selectedFiles) {
        const { valid, error } = await validateFileSecurity(file, type);
        if (valid) {
          validFiles.push(file);
        } else {
          toast({
            variant: "destructive",
            title: "Archivo rechazado",
            description: `${file.name}: ${error}`
          });
        }
      }

      if (validFiles.length > 0) {
        onFilesAdded(validFiles);
      }
      
      e.target.value = ''; // Reset input
    }
  };

  // --- LÓGICA DE CÁMARA (Web API) ---
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Intentar usar cámara trasera
      });
      setStream(mediaStream);
      setIsCameraOpen(true);
      
      // Esperar a que el elemento video esté renderizado
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (err) {
      console.error("Error accessing camera:", err);
      toast({ variant: "destructive", title: "Error de Cámara", description: "No se pudo acceder a la cámara. Verifica permisos o usa 'Subir Archivo'." });
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
            
            // Validar y enviar
            validateFileSecurity(file, 'foto').then(({ valid }) => {
              if (valid) {
                onFilesAdded([file]);
                stopCamera();
              } else {
                toast({ variant: "destructive", title: "Error", description: "Error procesando la foto capturada." });
              }
            });
          }
        }, 'image/jpeg', 0.8); // Calidad 80%
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
          <Badge variant={files.length >= minCount ? "outline" : "destructive"} className={files.length >= minCount ? "bg-green-50 text-green-700 border-green-200" : "text-[10px]"}>
            {isPhoto && minCount > 0 ? (files.length >= minCount ? `Completado (${files.length}/${minCount})` : `Faltan ${minCount - files.length}`) : 'Requerido'}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] bg-background">Opcional</Badge>
        )}
      </div>
      
      <div className="space-y-4">
        
        {/* VISTA DE CÁMARA ACTIVA */}
        {isCameraOpen ? (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[3/4] md:aspect-video flex items-center justify-center border-2 border-primary/50 shadow-lg animate-in fade-in zoom-in duration-300">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
            
            <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center gap-8 z-10">
              <Button 
                variant="secondary" 
                size="icon" 
                className="rounded-full h-12 w-12 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/20 text-white"
                onClick={stopCamera}
                title="Cerrar Cámara"
              >
                <X className="w-6 h-6" />
              </Button>
              
              <Button 
                variant="default" 
                size="icon" 
                className="rounded-full h-20 w-20 border-4 border-white bg-transparent hover:bg-white/20 transition-all active:scale-95 ring-4 ring-black/20"
                onClick={takePhoto}
                title="Tomar Foto"
              >
                <div className="h-16 w-16 bg-white rounded-full shadow-inner" />
              </Button>
            </div>
          </div>
        ) : (
          /* BOTONES DE ACCIÓN (Upload / Cámara) */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isPhoto && (
              <Button 
                variant="outline" 
                className="h-24 flex flex-col gap-2 border-dashed border-2 hover:bg-blue-50 hover:border-blue-300 transition-all group"
                onClick={startCamera}
                disabled={isUploading}
              >
                <div className="p-3 rounded-full bg-blue-50 group-hover:bg-blue-100 transition-colors">
                  <Camera className="w-6 h-6 text-blue-500" />
                </div>
                <span className="text-xs font-medium text-blue-700">Tomar Foto</span>
              </Button>
            )}

            <label 
              className={`flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-md cursor-pointer bg-background hover:bg-muted/50 transition-all group ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <div className="flex flex-col items-center justify-center">
                {isUploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                ) : (
                  <div className="p-3 rounded-full bg-muted group-hover:bg-muted/80 transition-colors mb-1">
                    <UploadCloud className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground font-medium mt-1">
                  {isUploading ? "Procesando..." : "Subir Archivo / Galería"}
                </p>
              </div>
              <input 
                type="file" 
                accept={isPhoto ? "image/*" : ".pdf,.doc,.docx,.xls,.xlsx,.txt"} 
                className="hidden" 
                multiple 
                onChange={handleFileChange} 
                disabled={isUploading} 
              />
            </label>
          </div>
        )}

        {/* GRID DE EVIDENCIAS (Lista visual) */}
        {files.length > 0 && (
          <div className={isPhoto ? "grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4" : "space-y-2 mt-4"}>
            {files.map(file => (
              isPhoto ? (
                // FOTO: Usamos el nuevo componente EvidenceThumbnail
                <div key={file.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-background shadow-sm animate-in fade-in zoom-in duration-300">
                  <EvidenceThumbnail file={file} />
                  
                  <button 
                    onClick={() => onDelete(file.id, file.storage_path)}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white p-1.5 rounded-full backdrop-blur-sm transition-colors z-10"
                    title="Eliminar"
                    type="button"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                // ARCHIVO: Lista simple
                <div key={file.id} className="flex items-center justify-between p-3 bg-background border rounded-lg text-sm shadow-sm animate-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 bg-blue-50 rounded text-blue-600">
                      <FileText className="w-4 h-4" />
                    </div>
                    <span className="truncate max-w-[180px] font-medium text-slate-700">{file.filename}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                    onClick={() => onDelete(file.id, file.storage_path)}
                  >
                    <Trash2 className="w-4 h-4" />
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