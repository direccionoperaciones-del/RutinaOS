import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, Calendar as CalendarIcon, Plus, Trash2, Clock } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function CalendarPage() {
  const { tenantId, user } = useCurrentUser();
  const { toast } = useToast();
  
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [items, setItems] = useState<any[]>([]); // Mezcla de tareas y eventos
  const [loading, setLoading] = useState(false);
  const [markedDates, setMarkedDates] = useState<Date[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", description: "", time: "09:00", type: "general" });
  const [saving, setSaving] = useState(false);

  // 1. Cargar días con actividad para marcar en calendario
  useEffect(() => {
    if (!tenantId) return;
    const fetchActivity = async () => {
      // Tareas
      const { data: tasks } = await supabase.from('task_instances').select('fecha_programada').eq('tenant_id', tenantId).limit(50);
      // Eventos manuales
      const { data: events } = await supabase.from('calendar_events').select('start_date').eq('tenant_id', tenantId).limit(50);
      
      const dates = [
        ...(tasks?.map(t => new Date(t.fecha_programada + 'T12:00:00')) || []),
        ...(events?.map(e => new Date(e.start_date)) || [])
      ];
      setMarkedDates(dates);
    };
    fetchActivity();
  }, [tenantId]);

  // 2. Cargar detalle del día
  const fetchDayItems = async () => {
    if (!tenantId || !date) return;
    setLoading(true);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Tareas Automáticas
    const { data: tasks } = await supabase
      .from('task_instances')
      .select(`id, estado, hora_limite_snapshot, routine_templates(nombre, prioridad), pdv(nombre)`)
      .eq('tenant_id', tenantId)
      .eq('fecha_programada', dateStr);

    // Eventos Manuales
    // Filtramos eventos que empiezan en este día (ignora timezone preciso para demo, asume UTC/Local consistency)
    const startOfDay = new Date(date); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(date); endOfDay.setHours(23,59,59,999);
    
    const { data: events } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('start_date', startOfDay.toISOString())
      .lte('start_date', endOfDay.toISOString());

    const combined = [
      ...(tasks?.map(t => ({ ...t, kind: 'task' })) || []),
      ...(events?.map(e => ({ ...e, kind: 'event' })) || [])
    ];

    setItems(combined);
    setLoading(false);
  };

  useEffect(() => {
    fetchDayItems();
  }, [date, tenantId]);

  // 3. Crear Evento
  const handleCreateEvent = async () => {
    if (!newEvent.title) return toast({variant:"destructive", title:"Error", description:"El título es obligatorio"});
    setSaving(true);
    
    // Combinar fecha seleccionada con hora
    const eventDate = new Date(date!);
    const [hours, minutes] = newEvent.time.split(':');
    eventDate.setHours(parseInt(hours), parseInt(minutes));
    
    const { error } = await supabase.from('calendar_events').insert({
      tenant_id: tenantId,
      title: newEvent.title,
      description: newEvent.description,
      start_date: eventDate.toISOString(),
      end_date: new Date(eventDate.getTime() + 3600000).toISOString(), // +1 hora default
      created_by: user.id
    });

    if (error) {
      toast({variant:"destructive", title:"Error", description: error.message});
    } else {
      toast({title:"Evento Creado", description:"Se ha agendado correctamente."});
      setIsModalOpen(false);
      setNewEvent({ title: "", description: "", time: "09:00", type: "general" });
      fetchDayItems(); // Recargar lista
    }
    setSaving(false);
  };

  // 4. Eliminar Evento
  const handleDeleteEvent = async (id: string) => {
    if (!confirm("¿Eliminar evento?")) return;
    const { error } = await supabase.from('calendar_events').delete().eq('id', id);
    if (!error) {
      toast({title:"Eliminado", description:"Evento removido."});
      fetchDayItems();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Calendario Operativo</h2>
        <p className="text-muted-foreground">Gestiona tareas automáticas y eventos manuales.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[400px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle>Navegación</CardTitle></CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              modifiers={{ hasTask: markedDates }}
              modifiersStyles={{ hasTask: { fontWeight: 'bold', color: 'var(--primary)', textDecoration: 'underline' } }}
              className="rounded-md border shadow p-4"
              locale={es}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col h-[600px]">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-primary" />
                {date ? format(date, "EEEE, d 'de' MMMM", { locale: es }) : "Selecciona fecha"}
              </CardTitle>
              <CardDescription>{items.length} actividades programadas.</CardDescription>
            </div>
            <Button onClick={() => setIsModalOpen(true)} disabled={!date}>
              <Plus className="w-4 h-4 mr-2" /> Agregar Evento
            </Button>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-hidden p-0">
            {loading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground"><p>No hay actividad.</p></div>
            ) : (
              <ScrollArea className="h-full p-6">
                <div className="space-y-4">
                  {items.map((item, idx) => (
                    <div key={idx} className={`flex items-start gap-4 p-4 rounded-lg border ${item.kind === 'task' ? 'bg-muted/30' : 'bg-blue-50/50 border-blue-100'}`}>
                      {item.kind === 'task' ? (
                         // Renderizado de Tarea Automática
                         <>
                           <div className={`w-2 h-full min-h-[40px] rounded-full ${item.estado === 'completada' ? 'bg-green-500' : 'bg-gray-300'}`} />
                           <div className="flex-1">
                             <div className="flex justify-between">
                               <h4 className="font-semibold">{item.routine_templates?.nombre}</h4>
                               <Badge variant="outline" className="text-[10px]">{item.routine_templates?.prioridad}</Badge>
                             </div>
                             <p className="text-sm text-muted-foreground">{item.pdv?.nombre} • Vence: {item.hora_limite_snapshot?.slice(0,5)}</p>
                           </div>
                         </>
                      ) : (
                        // Renderizado de Evento Manual
                        <>
                          <div className="flex flex-col items-center justify-center px-2 py-1 bg-white rounded border text-xs font-mono min-w-[60px]">
                            {format(new Date(item.start_date), 'HH:mm')}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-blue-900">{item.title}</h4>
                            <p className="text-sm text-blue-700">{item.description || "Sin descripción"}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => handleDeleteEvent(item.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Crear Evento */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Evento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="Ej: Reunión de equipo" />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <div className="relative">
                <Clock className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"/>
                <Input type="time" className="pl-8" value={newEvent.time} onChange={e => setNewEvent({...newEvent, time: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateEvent} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}