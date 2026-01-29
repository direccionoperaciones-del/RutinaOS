import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Clock, MapPin, Camera, Mail, 
  MessageSquareText, Box, FileText,
  Repeat, CalendarDays, CalendarRange, ArrowRight,
  User, Filter, Loader2, RefreshCw, AlertCircle,
  Trophy, PartyPopper, Coffee, Info, ShieldCheck, ShieldAlert,
  Calendar as CalendarIcon, CheckCircle2, X, Eye, 
  Trash2, Ban
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { TaskExecutionModal } from "./TaskExecutionModal";
import { CancelTaskModal } from "./components/CancelTaskModal";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMyTasks } from "@/hooks/useMyTasks";
import { getLocalDate, parseLocalDate, openDatePicker } from "@/lib/utils";
import { calculateTaskDeadline } from "./logic/task-deadline";

const getPriorityStyles = (priority: string) => {
  switch (priority) {
    case 'critica': return { badge: 'bg-red-600 text-white border-red-700', border: 'border-l-4 border-l-red-600' };
    case 'alta': return { badge: 'bg-orange-500 text-white border-orange-600', border: 'border-l-4 border-l-orange-500' };
    case 'media': return { badge: 'bg-yellow-500 text-white border-yellow-600', border: 'border-l-4 border-l-yellow-500' };
    default: return { badge: 'bg-emerald-600 text-white border-emerald-700', border: 'border-l-4 border-l-emerald-600' };
  }
};

const getFrequencyIcon = (freq: string) => {
  switch (freq) {
    case 'diaria': return <Repeat className="w-3 h-3" />;
    case 'semanal': return <CalendarDays className="w-3 h-3" />;
    default: return <CalendarRange className="w-3 h-3" />;
  }
};

const getStatusBadge = (task: any) => {
  const now = new Date();
  const deadline = calculateTaskDeadline(task);
  const isLate = task.estado === 'pendiente' && now.getTime() > deadline.getTime();
  
  if (task.estado === 'completada_a_tiempo') return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">A Tiempo</Badge>;
  if (task.estado === 'completada_vencida') return <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">Vencida</Badge>;
  if (task.estado === 'incumplida') return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Incumplida</Badge>;
  if (task.estado === 'cancelada') return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">Cancelada</Badge>;
  
  if (isLate) return <Badge className="bg-red-50 text-red-600 border-red-100 animate-pulse hover:bg-red-50">¡Vencida!</Badge>;
  
  return <Badge className="bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200">Pendiente</Badge>;
};

const TaskCard = ({ task, onAction, onCancel, canCancel }: { task: any, onAction: (t: any) => void, onCancel: (t: any) => void, canCancel: boolean }) => {
  const r = task.routine_templates || {};
  const styles = getPriorityStyles(task.prioridad_snapshot);
  const isDone = task.estado.startsWith('completada') || task.estado === 'incumplida';
  const isCancelled = task.estado === 'cancelada';
  
  const deadline = calculateTaskDeadline(task);
  const deadlineStr = format(deadline, "d MMM HH:mm", { locale: es });

  return (
    <Card className={`flex flex-col h-full hover:shadow-lg transition-all duration-200 border-l-4 ${isCancelled ? 'opacity-70 border-l-gray-400 bg-gray-50' : styles.border}`}>
      <CardHeader className="p-3 pb-1 space-y-1"> 
        <div className="flex justify-between items-start">
          <Badge className={`uppercase text-[9px] font-bold px-1.5 py-0 rounded-sm ${isCancelled ? 'bg-gray-500 border-gray-600' : styles.badge}`}>
            {task.prioridad_snapshot}
          </Badge>
          
          {task.audit_status === 'aprobado' && (
            <Badge className="bg-green-500 text-white border-green-600 gap-1 px-1.5 text-[10px]">
              <ShieldCheck className="w-3 h-3" /> Aprobada
            </Badge>
          )}
          {task.audit_status === 'rechazado' && (
            <Badge className="bg-red-500 text-white border-red-600 gap-1 px-1.5 text-[10px]">
              <ShieldAlert className="w-3 h-3" /> Rechazada
            </Badge>
          )}
          {(!task.audit_status || task.audit_status === 'pendiente') && !isCancelled && (
             <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase font-medium bg-muted px-1.5 py-0 rounded-full">
               {getFrequencyIcon(r.frecuencia)}
               {r.frecuencia}
             </div>
          )}
        </div>
        
        <div>
          <h3 className={`font-bold text-base leading-tight line-clamp-2 ${isCancelled ? 'line-through text-muted-foreground' : ''}`} title={r.nombre}>
            {r.nombre}
          </h3>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{task.pdv?.nombre}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-2 flex-1">
        <div className="flex justify-between items-center bg-muted/30 p-1.5 rounded-md mb-2">
          <div className="flex items-center gap-1.5 text-xs font-medium" title="Fecha límite de ejecución">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="capitalize">{deadlineStr}</span>
          </div>
          {getStatusBadge(task)}
        </div>

        {!isCancelled && (
          <div className="flex gap-2 text-muted-foreground justify-center py-1.5 border-t border-b border-dashed border-gray-100">
            {r.gps_obligatorio && <span title="GPS"><MapPin className="w-3 h-3 text-blue-500" /></span>}
            {r.fotos_obligatorias && <span title="Fotos"><Camera className="w-3 h-3 text-purple-500" /></span>}
            {r.requiere_inventario && <span title="Inventario"><Box className="w-3 h-3 text-orange-500" /></span>}
            {r.comentario_obligatorio && <span title="Notas"><MessageSquareText className="w-3 h-3 text-yellow-500" /></span>}
            {r.archivo_obligatorio && <span title="Archivo"><FileText className="w-3 h-3 text-cyan-500" /></span>}
            {(r.enviar_email || r.responder_email) && <span title="Email"><Mail className="w-3 h-3 text-pink-500" /></span>}
          </div>
        )}

        {isCancelled && task.cancel_reason && (
          <div className="mt-2 text-xs bg-red-50 p-2 rounded border border-red-100 text-red-800 italic">
            "{task.cancel_reason}"
          </div>
        )}

        {task.profiles && !isCancelled && (
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1 bg-muted/20 p-1 rounded">
            <User className="w-3 h-3" />
            <span className="truncate">{task.profiles.nombre} {task.profiles.apellido}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-2 bg-muted/10 flex gap-1">
        {!isCancelled && (
          <Button 
            className="flex-1 h-8 text-xs shadow-sm hover:shadow transition-all" 
            variant={isDone ? (task.audit_status === 'rechazado' ? "destructive" : "secondary") : "default"}
            size="sm"
            onClick={() => onAction(task)}
          >
            {isDone ? (
              task.audit_status === 'rechazado' ? (
                <><RefreshCw className="w-3 h-3 mr-1.5" /> Corregir Tarea</>
              ) : (
                <><Eye className="w-3 h-3 mr-1.5" /> Ver Detalle</>
              )
            ) : (
              <><ArrowRight className="w-3 h-3 ml-1.5" /> Ejecutar</>
            )}
          </Button>
        )}
        
        {canCancel && !isDone && !isCancelled && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 px-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
            onClick={() => onCancel(task)}
            title="Cancelar Tarea (Director/Líder)"
          >
            <Ban className="w-4 h-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

const TaskGrid = ({ items, loading, onRetry, emptyMessage, onAction, onCancel, canCancel }: any) => {
  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-muted/20 rounded-lg border-2 border-dashed">
        <CheckCircle2 className="w-12 h-12 mb-3 text-muted-foreground/50" />
        <h3 className="text-lg font-medium">Sin tareas</h3>
        <p className="text-muted-foreground text-sm mb-4">{emptyMessage}</p>
        <Button variant="link" onClick={onRetry} className="mt-2"><RefreshCw className="w-4 h-4 mr-2" /> Recargar Datos</Button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {items.map((task: any) => (
        <TaskCard 
          key={task.id} 
          task={task} 
          onAction={onAction} 
          onCancel={onCancel}
          canCancel={canCancel} 
        />
      ))}
    </div>
  );
};

const SegmentedProgressBar = ({ 
  total, 
  onTime, 
  late, 
  missed, 
  pending 
}: { 
  total: number, 
  onTime: number, 
  late: number, 
  missed: number, 
  pending: number 
}) => {
  const pctOnTime = total > 0 ? (onTime / total) * 100 : 0;
  const pctLate = total > 0 ? (late / total) * 100 : 0;
  const pctMissed = total > 0 ? (missed / total) * 100 : 0;
  const totalCompletedPct = total > 0 ? Math.round(((onTime + late) / total) * 100) : 0;

  return (
    <div className="bg-card border rounded-xl p-5 shadow-sm mb-6">
      <div className="flex justify-between items-end mb-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Cumplimiento Global</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${totalCompletedPct >= 80 ? 'text-emerald-600' : 'text-foreground'}`}>
              {totalCompletedPct}%
            </span>
            <span className="text-xs text-muted-foreground">de {total} tareas activas</span>
          </div>
        </div>
      </div>

      <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
        <div style={{ width: `${pctOnTime}%` }} className="bg-emerald-500 h-full transition-all duration-700 ease-out hover:bg-emerald-400" title={`A Tiempo: ${onTime}`} />
        <div style={{ width: `${pctLate}%` }} className="bg-amber-500 h-full transition-all duration-700 ease-out hover:bg-amber-400" title={`Vencidas: ${late}`} />
        <div style={{ width: `${pctMissed}%` }} className="bg-rose-500 h-full transition-all duration-700 ease-out hover:bg-rose-400" title={`Incumplidas: ${missed}`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-3 border-t border-dashed">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="text-xs font-semibold text-foreground">A Tiempo</span>
            <span className="text-[10px] text-muted-foreground">{onTime} tareas</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="text-xs font-semibold text-foreground">Vencidas</span>
            <span className="text-[10px] text-muted-foreground">{late} tareas</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="text-xs font-semibold text-foreground">Incumplidas</span>
            <span className="text-[10px] text-muted-foreground">{missed} tareas</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="text-xs font-semibold text-foreground">Pendientes</span>
            <span className="text-[10px] text-muted-foreground">{pending} tareas</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function TasksList() {
  const { user, profile, loading: loadingProfile } = useCurrentUser();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [taskToCancel, setTaskToCancel] = useState<any>(null);
  const [isExecutionOpen, setIsExecutionOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [activeAbsence, setActiveAbsence] = useState<any>(null);
  
  useEffect(() => { const today = getLocalDate(); setDateFrom(today); setDateTo(today); }, []);
  
  useEffect(() => {
    const checkAbsences = async () => {
      if (!user || !dateFrom || !dateTo) return;
      const { data } = await supabase.from('user_absences').select('*, absence_types(nombre)').eq('user_id', user.id).lte('fecha_desde', dateTo).gte('fecha_hasta', dateFrom).maybeSingle(); 
      setActiveAbsence(data);
    };
    checkAbsences();
  }, [user, dateFrom, dateTo]);
  
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const { data: tasks = [], isLoading, error, refetch } = useMyTasks(dateFrom, dateTo);

  const handleStartTask = (task: any) => { setSelectedTask(task); setIsExecutionOpen(true); };
  const handleCancelTask = (task: any) => { setTaskToCancel(task); setIsCancelOpen(true); };

  const filteredTasks = tasks.filter(t => {
    if (t.estado === 'cancelada' && !['director', 'lider'].includes(profile?.role || '')) return false;
    if (selectedPdvs.length > 0 && (!t.pdv || !selectedPdvs.includes(t.pdv.id))) return false;
    if (selectedRoutines.length > 0 && (!t.routine_templates || !selectedRoutines.includes(t.routine_templates.id))) return false;
    if (selectedUsers.length > 0 && (!t.profiles || !selectedUsers.includes(t.profiles.id))) return false;
    return true;
  });

  const canCancel = ['director', 'lider'].includes(profile?.role || '');
  const activeTasks = filteredTasks.filter(t => t.estado !== 'cancelada');
  const pendingTasks = activeTasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso');
  const completedTasks = activeTasks.filter(t => t.estado.startsWith('completada') || t.estado === 'incumplida');
  const cancelledTasks = filteredTasks.filter(t => t.estado === 'cancelada');

  const stats = useMemo(() => {
    return {
      total: activeTasks.length,
      onTime: activeTasks.filter(t => t.estado === 'completada_a_tiempo' || t.estado === 'completada').length,
      late: activeTasks.filter(t => t.estado === 'completada_vencida').length,
      missed: activeTasks.filter(t => t.estado === 'incumplida').length,
      pending: activeTasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso').length
    };
  }, [activeTasks]);

  const todayStr = getLocalDate();
  const showCongratulation = stats.total > 0 && stats.pending === 0 && dateTo <= todayStr && !activeAbsence; 

  const clearFilters = () => { const today = getLocalDate(); setDateFrom(today); setDateTo(today); setSelectedPdvs([]); setSelectedRoutines([]); setSelectedUsers([]); };
  const hasActiveFilters = selectedPdvs.length > 0 || selectedRoutines.length > 0 || selectedUsers.length > 0;

  const pdvOptions = useMemo(() => { const map = new Map(); tasks.forEach(t => { if (t.pdv) map.set(t.pdv.id, t.pdv.nombre); }); return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a,b) => a.label.localeCompare(b.label)); }, [tasks]);
  const routineOptions = useMemo(() => { const map = new Map(); tasks.forEach(t => { if (t.routine_templates) map.set(t.routine_templates.id, t.routine_templates.nombre); }); return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a,b) => a.label.localeCompare(b.label)); }, [tasks]);
  const userOptions = useMemo(() => { const map = new Map(); tasks.forEach(t => { if (t.profiles) map.set(t.profiles.id, `${t.profiles.nombre} ${t.profiles.apellido}`); }); return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a,b) => a.label.localeCompare(b.label)); }, [tasks]);
  const displayDate = useMemo(() => { if (!dateFrom || !dateTo) return "Cargando..."; if (dateFrom === dateTo) { return format(parseLocalDate(dateFrom), "EEEE, d 'de' MMMM", { locale: es }); } return "Rango seleccionado"; }, [dateFrom, dateTo]);

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col gap-1">
        {loadingProfile ? (
          <div className="flex items-center gap-4 mb-2 animate-pulse">
            <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-5 w-64" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 mb-2 animate-in fade-in duration-500">
            {profile?.tenants?.logo_url && (
              <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden border bg-white dark:bg-white/5 flex items-center justify-center p-1">
                <img src={profile.tenants.logo_url} alt="Logo Empresa" className="max-h-full max-w-full object-contain" />
              </div>
            )}
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">{profile?.nombre ? `Hola, ${profile.nombre}` : 'Bienvenido'}</h2>
              <p className="text-lg text-muted-foreground font-medium mt-1">Estas son tus actividades del día</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
            <p className="text-primary capitalize text-sm font-semibold bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full w-fit">
              {displayDate}
            </p>
        </div>
      </div>

      {activeAbsence && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="bg-blue-100 p-2 rounded-full text-blue-600 shrink-0"><Coffee className="w-6 h-6" /></div>
          <div>
            <h4 className="font-bold text-blue-900 text-lg">Tienes una novedad: {activeAbsence.absence_types?.nombre}</h4>
            <p className="text-blue-800 text-sm">Hasta el {format(parseLocalDate(activeAbsence.fecha_hasta), 'dd/MM/yyyy')}</p>
            <p className="text-xs text-blue-600 mt-1 flex items-center gap-1 font-medium"><Info className="w-3 h-3"/> {activeAbsence.politica === 'reasignar' ? 'Tareas reasignadas.' : 'Tareas omitidas.'}</p>
          </div>
        </div>
      )}

      <Card className="bg-muted/20 border-primary/10">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-primary"><Filter className="w-4 h-4" /> Filtros</div>
            <Button variant="ghost" size="icon" onClick={() => refetch()} title="Recargar"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /></Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {/* LAYOUT GRID RESPONSIVE CORREGIDO */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            
            {/* Campo Fecha Desde - 100% Mobile */}
            <div className="space-y-1 w-full min-w-0">
              <Label className="text-xs">Desde</Label>
              <div className="relative w-full">
                <CalendarIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer z-10 hover:text-primary transition-colors pointer-events-none" />
                <Input 
                  id="date-from-task" 
                  type="date" 
                  className="h-10 pl-9 text-sm bg-background w-full min-w-0 block" 
                  value={dateFrom} 
                  onChange={(e) => setDateFrom(e.target.value)}
                  onClick={(e) => openDatePicker('date-from-task')}
                />
              </div>
            </div>

            {/* Campo Fecha Hasta - 100% Mobile */}
            <div className="space-y-1 w-full min-w-0">
              <Label className="text-xs">Hasta</Label>
              <div className="relative w-full">
                <CalendarIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer z-10 hover:text-primary transition-colors pointer-events-none" />
                <Input 
                  id="date-to-task" 
                  type="date" 
                  className="h-10 pl-9 text-sm bg-background w-full min-w-0 block" 
                  value={dateTo} 
                  onChange={(e) => setDateTo(e.target.value)} 
                  onClick={(e) => openDatePicker('date-to-task')}
                />
              </div>
            </div>

            <div className="space-y-1 w-full min-w-0"><Label className="text-xs">Puntos de Venta</Label><MultiSelect options={pdvOptions} selected={selectedPdvs} onChange={setSelectedPdvs} placeholder="Todos" /></div>
            <div className="space-y-1 w-full min-w-0"><Label className="text-xs">Rutinas</Label><MultiSelect options={routineOptions} selected={selectedRoutines} onChange={setSelectedRoutines} placeholder="Todas" /></div>
            {profile?.role !== 'administrador' && (<div className="space-y-1 w-full min-w-0"><Label className="text-xs">Usuarios</Label><MultiSelect options={userOptions} selected={selectedUsers} onChange={setSelectedUsers} placeholder="Todos" /></div>)}
          </div>
          {hasActiveFilters && (<div className="mt-3 flex justify-end"><Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-7 text-destructive hover:bg-destructive/10"><X className="w-3 h-3 mr-1" /> Restablecer</Button></div>)}
        </CardContent>
      </Card>

      <SegmentedProgressBar 
        total={stats.total} 
        onTime={stats.onTime} 
        late={stats.late} 
        missed={stats.missed} 
        pending={stats.pending} 
      />

      {showCongratulation && !isLoading && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 text-center shadow-sm animate-in slide-in-from-top-4 duration-500 relative overflow-hidden mb-6">
          <div className="absolute top-0 right-0 opacity-10"><PartyPopper className="w-32 h-32 rotate-12 -mr-8 -mt-8 text-green-600" /></div>
          <div className="flex flex-col items-center gap-2 relative z-10">
            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mb-2 animate-bounce"><Trophy className="h-6 w-6 text-green-600" /></div>
            <h3 className="text-xl font-bold text-green-800 tracking-tight">¡FELICITACIONES!</h3>
            <p className="text-green-700 font-medium">La operación del día está completa.</p>
          </div>
        </div>
      )}

      {error && <div className="p-4 rounded border border-red-200 bg-red-50 text-red-700 flex items-center gap-2"><AlertCircle className="w-5 h-5" /><span>Error cargando tareas.</span></div>}

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="all">Todas ({activeTasks.length})</TabsTrigger>
          <TabsTrigger value="pending">Pendientes ({pendingTasks.length})</TabsTrigger>
          <TabsTrigger value="completed">Realizadas ({completedTasks.length})</TabsTrigger>
          {cancelledTasks.length > 0 && canCancel && (
            <TabsTrigger value="cancelled" className="data-[state=active]:bg-red-50 data-[state=active]:text-red-700">Canceladas ({cancelledTasks.length})</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="all" className="mt-0"><TaskGrid items={activeTasks} loading={isLoading} onRetry={refetch} emptyMessage="No hay tareas programadas." onAction={handleStartTask} onCancel={handleCancelTask} canCancel={canCancel} /></TabsContent>
        <TabsContent value="pending" className="mt-0"><TaskGrid items={pendingTasks} loading={isLoading} onRetry={refetch} emptyMessage={activeAbsence ? "No tienes tareas pendientes." : (showCongratulation ? "¡Todo listo!" : "No tienes tareas pendientes.")} onAction={handleStartTask} onCancel={handleCancelTask} canCancel={canCancel} /></TabsContent>
        <TabsContent value="completed" className="mt-0"><TaskGrid items={completedTasks} loading={isLoading} onRetry={refetch} emptyMessage="Aún no hay tareas completadas." onAction={handleStartTask} onCancel={handleCancelTask} canCancel={canCancel} /></TabsContent>
        {canCancel && (
          <TabsContent value="cancelled" className="mt-0"><TaskGrid items={cancelledTasks} loading={isLoading} onRetry={refetch} emptyMessage="No hay tareas canceladas." onAction={handleStartTask} onCancel={handleCancelTask} canCancel={false} /></TabsContent>
        )}
      </Tabs>

      <TaskExecutionModal task={selectedTask} open={isExecutionOpen} onOpenChange={setIsExecutionOpen} onSuccess={() => refetch()} />
      <CancelTaskModal task={taskToCancel} open={isCancelOpen} onOpenChange={setIsCancelOpen} onSuccess={() => refetch()} />
    </div>
  );
}