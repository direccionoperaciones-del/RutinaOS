import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Image as ImageIcon, Filter, Calendar, MapPin, User, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

export default function GalleryPage() {
  const { toast } = useToast();
  const [evidences, setEvidences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedImage, setSelectedImage] = useState<any>(null);

  const fetchEvidences = async () => {
    setLoading(true);
    // Unir evidence_files con task_instances para obtener contexto
    const { data, error } = await supabase
      .from('evidence_files')
      .select(`
        *,
        task_instances (
          fecha_programada,
          routine_templates (nombre),
          pdv (nombre, ciudad),
          profiles:completado_por (nombre, apellido)
        )
      `)
      .eq('tipo', 'foto')
      .order('created_at', { ascending: false })
      .limit(50); // Límite inicial

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las evidencias." });
    } else {
      setEvidences(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEvidences();
  }, []);

  const filteredEvidences = evidences.filter(e => {
    const term = searchTerm.toLowerCase();
    const pdv = e.task_instances?.pdv?.nombre?.toLowerCase() || "";
    const rutina = e.task_instances?.routine_templates?.nombre?.toLowerCase() || "";
    const user = (e.task_instances?.profiles?.nombre + " " + e.task_instances?.profiles?.apellido).toLowerCase();
    
    return pdv.includes(term) || rutina.includes(term) || user.includes(term);
  });

  // Nota: En una app real, las URLs deben ser firmadas si el bucket es privado.
  // Asumimos bucket público o función de firmado por ahora.
  const getImageUrl = (path: string) => {
    // Si usas Supabase Storage, ajusta esto:
    const { data } = supabase.storage.from('evidence').getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Galería de Evidencias</h2>
        <p className="text-muted-foreground">Registro visual de las ejecuciones en campo.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por PDV, Rutina o Usuario..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={fetchEvidences}>
          <Filter className="w-4 h-4 mr-2" /> Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="aspect-square bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      ) : filteredEvidences.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
          <h3 className="text-lg font-medium">Sin evidencias</h3>
          <p className="text-muted-foreground">No se encontraron fotos con los filtros actuales.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredEvidences.map((evidence) => (
            <Card 
              key={evidence.id} 
              className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all group"
              onClick={() => setSelectedImage(evidence)}
            >
              <div className="aspect-square relative bg-muted">
                {/* Placeholder de imagen real */}
                <img 
                  src={getImageUrl(evidence.storage_path)} 
                  alt={evidence.filename}
                  className="object-cover w-full h-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://placehold.co/400x400?text=Error+Carga";
                  }}
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white p-2 text-center text-xs">
                  <span className="font-medium">{evidence.task_instances?.routine_templates?.nombre}</span>
                </div>
              </div>
              <CardContent className="p-2">
                <p className="text-xs font-medium truncate" title={evidence.task_instances?.pdv?.nombre}>
                  {evidence.task_instances?.pdv?.nombre}
                </p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(evidence.created_at), "dd/MM HH:mm")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Detalle de Imagen */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden bg-black/95 border-none text-white">
          <div className="relative w-full h-[60vh] flex items-center justify-center bg-black">
             {selectedImage && (
               <img 
                 src={getImageUrl(selectedImage.storage_path)} 
                 alt={selectedImage.filename}
                 className="max-w-full max-h-full object-contain"
               />
             )}
          </div>
          <div className="p-4 bg-zinc-900 grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-bold text-lg">{selectedImage?.task_instances?.routine_templates?.nombre}</h3>
              <div className="flex items-center gap-2 text-sm text-zinc-400 mt-1">
                <MapPin className="w-4 h-4" />
                {selectedImage?.task_instances?.pdv?.nombre} - {selectedImage?.task_instances?.pdv?.ciudad}
              </div>
            </div>
            <div className="text-right space-y-1">
              <div className="flex items-center justify-end gap-2 text-sm text-zinc-400">
                <User className="w-4 h-4" />
                {selectedImage?.task_instances?.profiles?.nombre} {selectedImage?.task_instances?.profiles?.apellido}
              </div>
              <div className="flex items-center justify-end gap-2 text-sm text-zinc-400">
                <Calendar className="w-4 h-4" />
                {selectedImage && format(new Date(selectedImage.created_at), "PPP p", { locale: es })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}