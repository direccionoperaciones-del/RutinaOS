import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MultiSelect } from "@/components/ui/multi-select";
import { Search, Image as ImageIcon, Filter, Calendar, MapPin, User, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { getLocalDate } from "@/lib/utils";

export default function GalleryPage() {
  const { toast } = useToast();
  const [evidences, setEvidences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<any>(null);

  // --- FILTROS ---
  const [dateFrom, setDateFrom] = useState(getLocalDate());
  const [dateTo, setDateTo] = useState(getLocalDate());
  
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Opciones para los selectores
  const [pdvOptions, setPdvOptions] = useState<{label: string, value: string}[]>([]);
  const [routineOptions, setRoutineOptions] = useState<{label: string, value: string}[]>([]);
  const [userOptions, setUserOptions] = useState<{label: string, value: string}[]>([]);

  // Cargar opciones de filtros al montar
  useEffect(() => {
    const fetchOptions = async () => {
      // PDVs
      const { data: pdvs } = await supabase.from('pdv').select('id, nombre').eq('activo', true).order('nombre');
      if (pdvs) setPdvOptions(pdvs.map(p => ({ label: p.nombre, value: p.id })));

      // Rutinas
      const { data: routines } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true).order('nombre');
      if (routines) setRoutineOptions(routines.map(r => ({ label: r.nombre, value: r.id })));

      // Usuarios
      const { data: users } = await supabase.from('profiles').select('id, nombre, apellido').eq('activo', true).order('nombre');
      if (users) setUserOptions(users.map(u => ({ label: `${u.nombre} ${u.apellido}`, value: u.id })));
    };
    fetchOptions();
  }, []);

  const fetchEvidences = async () => {
    setLoading(true);
    try {
      // Usamos !inner para forzar el filtrado en la tabla relacionada si se aplica un filtro
      // Si no hay filtros, usamos left join normal para no perder datos si algo falta (aunque en este modelo task_id es FK not null)
      
      let query = supabase
        .from('evidence_files')
        .select(`
          *,
          task_instances!inner (
            id,
            fecha_programada,
            pdv_id,
            rutina_id,
            completado_por,
            routine_templates (nombre),
            pdv (nombre, ciudad),
            profiles:completado_por (nombre, apellido)
          )
        `)
        .eq('tipo', 'foto')
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

      if (selectedPdvs.length > 0) {
        query = query.in('task_instances.pdv_id', selectedPdvs);
      }
      if (selectedRoutines.length > 0) {
        query = query.in('task_instances.rutina_id', selectedRoutines);
      }
      if (selectedUsers.length > 0) {
        query = query.in('task_instances.completado_por', selectedUsers);
      }

      // Límite de seguridad
      query = query.limit(100);

      const { data, error } = await query;

      if (error) throw error;
      setEvidences(data || []);
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las evidencias." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidences();
  }, []); // Carga inicial

  const handleRefresh = () => {
    fetchEvidences();
  };

  const clearFilters = () => {
    setDateFrom(getLocalDate());
    setDateTo(getLocalDate());
    setSelectedPdvs([]);
    setSelectedRoutines([]);
    setSelectedUsers([]);
  };

  const hasActiveFilters = 
    selectedPdvs.length > 0 || 
    selectedRoutines.length > 0 || 
    selectedUsers.length > 0 ||
    dateFrom !== getLocalDate() || 
    dateTo !== getLocalDate();

  const getImageUrl = (path: string) => {
    const { data } = supabase.storage.from('evidence').getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Galería de Evidencias</h2>
        <p className="text-muted-foreground">Registro visual de las ejecuciones en campo.</p>
      </div>

      {/* --- PANEL DE FILTROS --- */}
      <Card className="bg-muted/20 border-primary/10 overflow-hidden">
        {/* En móvil usamos Accordion */}
        <div className="md:hidden">
          <Accordion type="single" collapsible>
            <AccordionItem value="filters" className="border-none">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Filter className="w-4 h-4" /> Filtros de Búsqueda
                  {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-primary" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Desde</Label>
                    <Input type="date" className="h-9" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hasta</Label>
                    <Input type="date" className="h-9" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rutina</Label>
                  <MultiSelect options={routineOptions} selected={selectedRoutines} onChange={setSelectedRoutines} placeholder="Seleccionar rutinas..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">PDV</Label>
                  <MultiSelect options={pdvOptions} selected={selectedPdvs} onChange={setSelectedPdvs} placeholder="Seleccionar PDVs..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Usuario</Label>
                  <MultiSelect options={userOptions} selected={selectedUsers} onChange={setSelectedUsers} placeholder="Seleccionar usuarios..." />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" className="flex-1" onClick={handleRefresh}>
                    Buscar
                  </Button>
                  {hasActiveFilters && (
                    <Button size="sm" variant="outline" onClick={clearFilters} className="text-destructive">
                      Limpiar
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* En desktop mostramos expandido */}
        <CardContent className="hidden md:block px-4 py-4">
          <div className="grid grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" className="h-8 pl-2 text-xs bg-background" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" className="h-8 pl-2 text-xs bg-background" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rutina</Label>
              <MultiSelect options={routineOptions} selected={selectedRoutines} onChange={setSelectedRoutines} placeholder="Todas" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">PDV</Label>
              <MultiSelect options={pdvOptions} selected={selectedPdvs} onChange={setSelectedPdvs} placeholder="Todos" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Usuario</Label>
              <MultiSelect options={userOptions} selected={selectedUsers} onChange={setSelectedUsers} placeholder="Todos" />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" className="h-8 w-full" onClick={handleRefresh}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4 mr-2" />} 
                Filtrar
              </Button>
              {hasActiveFilters && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={clearFilters} title="Limpiar filtros">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div key={i} className="aspect-square bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      ) : evidences.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
          <h3 className="text-lg font-medium">Sin evidencias</h3>
          <p className="text-muted-foreground">No se encontraron fotos con los filtros actuales.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {evidences.map((evidence) => (
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
                  loading="lazy"
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
                <div className="flex justify-between items-center mt-1">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(evidence.created_at), "dd/MM HH:mm")}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[60px]" title={evidence.task_instances?.profiles?.nombre}>
                    {evidence.task_instances?.profiles?.nombre}
                  </p>
                </div>
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