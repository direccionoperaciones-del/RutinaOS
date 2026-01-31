import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Image as ImageIcon, Download, Filter, X, Calendar, MapPin, Search } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { MultiSelect } from "@/components/ui/multi-select";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocalDate } from "@/lib/utils";

// --- COMPONENTE DE TARJETA OPTIMIZADO (Lazy Load) ---
const EvidenceCard = ({ evidence, onClick }: { evidence: any, onClick: (ev: any) => void }) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadUrl = async () => {
      // 1. Intentar obtener URL firmada
      const { data } = await supabase.storage
        .from('evidence')
        .createSignedUrl(evidence.storage_path, 3600); // 1 hora de validez

      if (mounted && data?.signedUrl) {
        setImgUrl(data.signedUrl);
        setLoading(false);
      }
    };
    loadUrl();
    return () => { mounted = false; };
  }, [evidence.storage_path]);

  return (
    <Card 
      className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all group border-0 shadow-sm relative"
      onClick={() => onClick({ ...evidence, signedUrl: imgUrl })}
    >
      <div className="aspect-square relative bg-muted">
        {loading ? (
          <Skeleton className="w-full h-full" />
        ) : (
          <img 
            src={imgUrl || ""} 
            alt={evidence.filename}
            className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        )}
        
        {/* Overlay con información */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-100 transition-opacity flex flex-col justify-end p-3 text-white">
          <div className="flex justify-between items-end">
            <div className="overflow-hidden">
              <p className="font-bold text-xs truncate" title={evidence.task_instances?.routine_templates?.nombre}>
                {evidence.task_instances?.routine_templates?.nombre}
              </p>
              <p className="text-white/90 text-[10px] truncate flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {evidence.task_instances?.pdv?.nombre}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 mt-1 pt-1 border-t border-white/20">
            <Calendar className="w-3 h-3 text-white/80" />
            <span className="text-[10px] font-mono text-white/90">
              {format(new Date(evidence.created_at), "dd/MM/yy HH:mm")}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default function GalleryPage() {
  const { toast } = useToast();
  const [evidences, setEvidences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<any>(null);
  
  // Filtros
  const today = getLocalDate();
  const [dateFrom, setDateFrom] = useState<string>(today);
  const [dateTo, setDateTo] = useState<string>(today);
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);

  // Opciones para filtros
  const [pdvOptions, setPdvOptions] = useState<{label: string, value: string}[]>([]);
  const [routineOptions, setRoutineOptions] = useState<{label: string, value: string}[]>([]);

  // Cargar opciones de filtros
  useEffect(() => {
    const loadOptions = async () => {
      const { data: pdvs } = await supabase.from('pdv').select('id, nombre').eq('activo', true).order('nombre');
      if (pdvs) setPdvOptions(pdvs.map(p => ({ label: p.nombre, value: p.id })));

      const { data: routines } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true).order('nombre');
      if (routines) setRoutineOptions(routines.map(r => ({ label: r.nombre, value: r.id })));
    };
    loadOptions();
  }, []);

  const fetchEvidences = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('evidence_files')
        .select(`
          id, storage_path, filename, created_at,
          task_instances!inner (
            id,
            pdv_id,
            rutina_id,
            pdv (nombre),
            routine_templates (nombre),
            profiles:completado_por (nombre, apellido)
          )
        `)
        .eq('tipo', 'foto')
        .order('created_at', { ascending: false });

      // Aplicar Filtros
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
      if (selectedPdvs.length > 0) query = query.in('task_instances.pdv_id', selectedPdvs);
      if (selectedRoutines.length > 0) query = query.in('task_instances.rutina_id', selectedRoutines);

      const { data, error } = await query.limit(100); // Límite seguro

      if (error) throw error;
      setEvidences(data || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidences();
  }, [dateFrom, dateTo, selectedPdvs, selectedRoutines]);

  const clearFilters = () => {
    setDateFrom(today);
    setDateTo(today);
    setSelectedPdvs([]);
    setSelectedRoutines([]);
  };

  const hasActiveFilters = selectedPdvs.length > 0 || selectedRoutines.length > 0;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Galería de Evidencias</h2>
        <p className="text-muted-foreground">Visualización de fotos operativas con filtros por fecha y punto de venta.</p>
      </div>

      {/* PANEL DE FILTROS */}
      <Card className="bg-muted/20 border-primary/10">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <DateRangePicker 
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                className="col-span-1 md:col-span-2"
              />
              
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Puntos de Venta</Label>
                <MultiSelect 
                  options={pdvOptions} 
                  selected={selectedPdvs} 
                  onChange={setSelectedPdvs} 
                  placeholder="Filtrar PDVs..." 
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Rutinas</Label>
                <MultiSelect 
                  options={routineOptions} 
                  selected={selectedRoutines} 
                  onChange={setSelectedRoutines} 
                  placeholder="Filtrar Rutinas..." 
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-destructive h-8">
                  <X className="w-3 h-3 mr-2" /> Limpiar Filtros
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* GRID DE FOTOS */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[1,2,3,4,5,6,7,8,9,10].map(i => <Skeleton key={i} className="aspect-square rounded-lg" />)}
        </div>
      ) : evidences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-muted/10">
          <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground font-medium">No se encontraron evidencias con los filtros actuales.</p>
          <Button variant="link" onClick={clearFilters} className="mt-2">Restablecer filtros</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-in fade-in duration-500">
          {evidences.map((evidence) => (
            <EvidenceCard 
              key={evidence.id} 
              evidence={evidence} 
              onClick={setSelectedImage}
            />
          ))}
        </div>
      )}

      {/* LIGHTBOX MODAL */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border-none h-[90vh] flex flex-col">
          {selectedImage && (
            <>
              <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
                <img 
                  src={selectedImage.signedUrl} 
                  alt={selectedImage.filename}
                  className="max-h-full max-w-full object-contain shadow-2xl"
                />
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 shrink-0 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{selectedImage.task_instances?.routine_templates?.nombre}</h4>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {selectedImage.task_instances?.pdv?.nombre}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {format(new Date(selectedImage.created_at), "PPP p", { locale: es })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Por: {selectedImage.task_instances?.profiles?.nombre} {selectedImage.task_instances?.profiles?.apellido}
                    </p>
                  </div>
                  <Button variant="outline" size="icon" asChild>
                    <a 
                      href={selectedImage.signedUrl} 
                      download={selectedImage.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}