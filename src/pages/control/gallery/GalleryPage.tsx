import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Image as ImageIcon, FileText, Download } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function GalleryPage() {
  const { toast } = useToast();
  const [evidences, setEvidences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<any>(null);
  
  // Cache specifically for signed URLs to prevent flickering/refetching
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const fetchEvidences = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('evidence_files')
      .select(`
        *,
        task_instances (
          pdv (nombre),
          routine_templates (nombre),
          profiles:completado_por (nombre, apellido)
        )
      `)
      .eq('tipo', 'foto')
      .order('created_at', { ascending: false })
      .limit(50); // Límite inicial para performance

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo cargar la galería." });
    } else {
      setEvidences(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEvidences();
  }, []);

  // Generate signed URLs when evidences change
  useEffect(() => {
    const generateUrls = async () => {
      const newUrls: Record<string, string> = {};
      
      const promises = evidences.map(async (ev) => {
        if (!signedUrls[ev.storage_path]) {
          const { data } = await supabase.storage
            .from('evidence')
            .createSignedUrl(ev.storage_path, 3600); // Valid for 1 hour
            
          if (data?.signedUrl) {
            newUrls[ev.storage_path] = data.signedUrl;
          }
        }
      });

      await Promise.all(promises);
      
      if (Object.keys(newUrls).length > 0) {
        setSignedUrls(prev => ({ ...prev, ...newUrls }));
      }
    };

    if (evidences.length > 0) {
      generateUrls();
    }
  }, [evidences]);

  const getImageUrl = (path: string) => {
    return signedUrls[path] || "https://placehold.co/400x400?text=Cargando...";
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Galería de Evidencias</h2>
        <p className="text-muted-foreground">Visualización centralizada de fotos capturadas en campo.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : evidences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/10">
          <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No hay imágenes recientes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {evidences.map((evidence) => (
            <Card 
              key={evidence.id} 
              className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all group border-0 shadow-sm"
              onClick={() => setSelectedImage(evidence)}
            >
              <div className="aspect-square relative bg-muted">
                <img 
                  src={getImageUrl(evidence.storage_path)} 
                  alt={evidence.filename}
                  className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                  <p className="text-white text-xs font-medium truncate">{evidence.task_instances?.routine_templates?.nombre}</p>
                  <p className="text-white/80 text-[10px] truncate">{evidence.task_instances?.pdv?.nombre}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border-none">
          {selectedImage && (
            <div className="relative flex flex-col h-[80vh]">
              <div className="flex-1 flex items-center justify-center p-4">
                <img 
                  src={getImageUrl(selectedImage.storage_path)} 
                  alt={selectedImage.filename}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 flex justify-between items-center shrink-0">
                <div>
                  <h4 className="font-semibold text-sm">{selectedImage.task_instances?.routine_templates?.nombre}</h4>
                  <p className="text-xs text-muted-foreground">
                    {selectedImage.task_instances?.pdv?.nombre} • {format(new Date(selectedImage.created_at), "PPP p", { locale: es })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Por: {selectedImage.task_instances?.profiles?.nombre} {selectedImage.task_instances?.profiles?.apellido}
                  </p>
                </div>
                <a 
                  href={getImageUrl(selectedImage.storage_path)} 
                  download={selectedImage.filename}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-muted rounded-full transition-colors"
                >
                  <Download className="w-5 h-5 text-muted-foreground" />
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}