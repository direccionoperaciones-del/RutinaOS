import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarOff, UserCog, Edit2, Trash2, ShieldAlert, Plus, RefreshCw, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AbsenceModal } from "../personnel/AbsenceModal";
import { parseLocalDate } from "@/lib/utils";

export default function AbsencesPage() {
  const { toast } = useToast();
  const [absences, setAbsences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
  const [selectedAbsence, setSelectedAbsence] = useState<any>(null);

  const fetchAbsences = async () => {
    setLoading(true);
    const { data: absData, error: absError } = await supabase
      .from('user_absences')
      .select(`
        *,
        absence_types (nombre),
        profiles:user_id (nombre, apellido, email),
        receptor:receptor_id (nombre, apellido)
      `)
      .order('created_at', { ascending: false });
    
    if (absError) {
       console.error("Error fetching absences:", absError);
       toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las novedades." });
    } else {
       setAbsences(absData || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAbsences();
  }, []);

  const handleAddAbsence = () => {
    setSelectedAbsence(null);
    setIsAbsenceModalOpen(true);
  };

  const handleEditAbsence = (absence: any) => {
    setSelectedAbsence(absence);
    setIsAbsenceModalOpen(true);
  };

  const handleDeleteAbsence = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta novedad?")) return;
    
    const { error } = await supabase.from('user_absences').delete().eq('id', id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      toast({ title: "Eliminado", description: "Novedad eliminada correctamente." });
      fetchAbsences();
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Novedades de Usuarios</h2>
          <p className="text-muted-foreground">Historial de ausencias, incapacidades y vacaciones del personal.</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={fetchAbsences} title="Recargar lista">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={handleAddAbsence}>
              <Plus className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">Registrar Novedad</span>
              <span className="sm:hidden">Nueva</span>
            </Button>
        </div>
      </div>

      <Card className="border-none shadow-none bg-transparent sm:bg-card sm:border sm:shadow">
        <CardHeader className="p-0 sm:p-6 mb-4 sm:mb-0">
          <CardTitle className="hidden sm:block">Historial de Novedades</CardTitle>
          <CardDescription className="hidden sm:block">Registro completo de ausencias registradas.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          
          {/* MOBILE VIEW */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {absences.map(abs => (
              <Card key={abs.id} className="p-4 shadow-sm border-l-4 border-l-blue-500">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-sm">{abs.profiles?.nombre} {abs.profiles?.apellido}</h4>
                    <p className="text-xs text-muted-foreground">{abs.absence_types?.nombre}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditAbsence(abs)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteAbsence(abs.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs bg-muted/50 p-2 rounded mb-3">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span>
                    {format(parseLocalDate(abs.fecha_desde), "dd MMM")} - {format(parseLocalDate(abs.fecha_hasta), "dd MMM yyyy")}
                  </span>
                </div>

                {abs.politica === 'reasignar' ? (
                    <div className="flex items-center gap-2 text-blue-700 bg-blue-50 px-2 py-1.5 rounded w-full border border-blue-100 text-xs">
                      <UserCog className="w-3 h-3" /> 
                      <span>Reemplazo: <strong>{abs.receptor?.nombre} {abs.receptor?.apellido}</strong></span>
                    </div>
                ) : (
                  <div className="flex items-center gap-2 text-orange-700 bg-orange-50 px-2 py-1.5 rounded w-full border border-orange-100 text-xs">
                      <ShieldAlert className="w-3 h-3" /> 
                      <span>Tareas Omitidas</span>
                    </div>
                )}
              </Card>
            ))}
            {absences.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground text-sm">No hay novedades registradas.</div>
            )}
          </div>

          {/* DESKTOP VIEW */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fechas</TableHead>
                  <TableHead>Política / Reemplazo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {absences.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No hay novedades registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  absences.map(abs => (
                    <TableRow key={abs.id}>
                      <TableCell>
                        <div className="font-medium">{abs.profiles?.nombre} {abs.profiles?.apellido}</div>
                        <div className="text-xs text-muted-foreground">{abs.profiles?.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{abs.absence_types?.nombre}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <CalendarOff className="w-4 h-4 text-muted-foreground" />
                          <span>
                            {format(parseLocalDate(abs.fecha_desde), "dd/MM/yyyy")} - {format(parseLocalDate(abs.fecha_hasta), "dd/MM/yyyy")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {abs.politica === 'reasignar' ? (
                           <div className="flex items-center gap-2 text-blue-700 bg-blue-50 px-2 py-1 rounded w-fit border border-blue-100 text-xs">
                             <UserCog className="w-3 h-3" /> 
                             <span>Reemplazo: <strong>{abs.receptor?.nombre} {abs.receptor?.apellido}</strong></span>
                           </div>
                        ) : (
                          <div className="flex items-center gap-2 text-orange-700 bg-orange-50 px-2 py-1 rounded w-fit border border-orange-100 text-xs">
                             <ShieldAlert className="w-3 h-3" /> 
                             <span>Tareas Omitidas</span>
                           </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEditAbsence(abs)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteAbsence(abs.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AbsenceModal 
        open={isAbsenceModalOpen} 
        onOpenChange={setIsAbsenceModalOpen} 
        onSuccess={fetchAbsences}
        absenceToEdit={selectedAbsence}
      />
    </div>
  );
}