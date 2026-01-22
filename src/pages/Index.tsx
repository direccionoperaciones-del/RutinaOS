import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, AlertTriangle, Clock, TrendingUp, BarChart3, Filter, X, Calendar as CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getLocalDate, parseLocalDate } from "@/lib/utils";

// Componente Tarjeta KPI Renovado
const StatCard = ({ title, value, description, icon: Icon, colorClass, loading }: any) => (
  <Card className="border-none shadow-md hover:shadow-lg transition-shadow duration-300 bg-card overflow-hidden relative group">
    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
      <Icon className="w-16 h-16" />
    </div>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 z-10">
      <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </CardTitle>
      <Icon className={`h-4 w-4 ${colorClass || "text-primary"}`} />
    </CardHeader>
    <CardContent className="z-10 relative">
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <>
          <div className="text-3xl font-bold tracking-tight text-foreground">{value}</div>
          <p className="text-xs text-muted-foreground mt-1 font-medium">
            {description}
          </p>
        </>
      )}
    </CardContent>
  </Card>
);

const Index = () => {
  const { profile, user } = useCurrentUser();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  
  useEffect(() => {
    const today = getLocalDate();
    setDateFrom(today);
    setDateTo(today);
  }, []);
  
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  
  const [pdvOptions, setPdvOptions] = useState<{label: string, value: string}[]>([]);
  const [routineOptions, setRoutineOptions] = useState<{label: string, value: string}[]>([]);
  const [userOptions, setUserOptions] = useState<{label: string, value: string}[]>([]);

  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    compliance: 0,
    criticalPending: 0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  const priorityOptions = [
    { label: "Baja", value: "baja" },
    { label: "Media", value: "media" },
    { label: "Alta", value: "alta" },
    { label: "Crítica", value: "critica" },
  ];

  const statusOptions = [
    { label: "Pendiente/Proceso", value: "pendiente" },
    { label: "Completada a Tiempo", value: "completada_a_tiempo" },
    { label: "Completada Vencida", value: "completada_vencida" },
    { label: "Incumplida", value: "incumplida" },
  ];

  useEffect(() => {
    const loadFilterOptions = async () => {
      const { data: pdvData } = await supabase.from('pdv').select('id, nombre').eq('activo', true).order('nombre');
      const { data: routData } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true).order('nombre');
      
      setPdvOptions(pdvData?.map(p => ({ label: p.nombre, value: p.id })) || []);
      setRoutineOptions(routData?.map(r => ({ label: r.nombre, value: r.id })) || []);

      if (profile?.role !== 'administrador') {
        const { data: userData } = await supabase.from('profiles').select('id, nombre, apellido').eq('activo', true).order('nombre');
        setUserOptions(userData?.map(u => ({ label: `${u.nombre} ${u.apellido}`, value: u.id })) || []);
      }
    };
    
    if (profile) loadFilterOptions();
  }, [profile]);

  const fetchDashboardData = async () => {
    if (!profile || !user || !dateFrom || !dateTo) return;
    setLoading(true);

    let query = supabase
      .from('task_instances')
      .select(`
        id, estado, prioridad_snapshot, completado_at, created_at, fecha_programada,
        routine_templates (nombre), pdv (nombre), profiles:completado_por (nombre, apellido)
      `)
      .gte('fecha_programada', dateFrom)
      .lte('fecha_programada', dateTo);

    if (profile.role === 'administrador') {
      query = query.or(`responsable_id.eq.${user.id},completado_por.eq.${user.id}`);
    } else {
      if (selectedUsers.length > 0) query = query.in('completado_por', selectedUsers);
    }

    if (selectedPdvs.length > 0) query = query.in('pdv_id', selectedPdvs);
    if (selectedRoutines.length > 0) query = query.in('rutina_id', selectedRoutines);
    if (selectedPriorities.length > 0) query = query.in('prioridad_snapshot', selectedPriorities);
    
    if (selectedStatus.length > 0) {
      const statusesToFilter = [];
      if (selectedStatus.includes("pendiente")) statusesToFilter.push("pendiente", "en_proceso");
      selectedStatus.forEach(s => { if (s !== "pendiente") statusesToFilter.push(s); });
      query = query.in('estado', statusesToFilter);
    }

    const { data: tasks, error } = await query;

    if (error) { setLoading(false); return; }

    const total = tasks.length;
    const completed = tasks.filter(t => t.estado.startsWith('completada')).length;
    const pending = tasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso').length;
    const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const critical = tasks.filter(t => 
      (t.prioridad_snapshot === 'alta' || t.prioridad_snapshot === 'critica') && 
      (t.estado === 'pendiente' || t.estado === 'incumplida')
    ).length;

    setStats({ totalTasks: total, completedTasks: completed, pendingTasks: pending, compliance, criticalPending: critical });

    const activity = [...tasks]
      .sort((a, b) => new Date(b.completado_at || b.created_at).getTime() - new Date(a.completado_at || a.created_at).getTime())
      .slice(0, 10);
    setRecentActivity(activity);

    const groupedData = tasks.reduce((acc: any, curr) => {
      const date = curr.fecha_programada;
      if (!acc[date]) acc[date] = { date, total: 0, completed: 0, failed: 0 };
      acc[date].total++;
      if (curr.estado.startsWith('completada')) acc[date].completed++;
      if (curr.estado === 'incumplida') acc[date].failed++;
      return acc;
    }, {});

    const chartArray = Object.values(groupedData)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((item: any) => ({
        name: format(parseLocalDate(item.date), 'dd MMM', { locale: es }),
        Total: item.total,
        Completadas: item.completed,
        Incumplidas: item.failed
      }));

    setChartData(chartArray);
    setLoading(false);
  };

  useEffect(() => {
    fetchDashboardData();
  }, [dateFrom, dateTo, selectedPdvs, selectedRoutines, selectedUsers, selectedPriorities, selectedStatus, profile, user]);

  const clearFilters = () => {
    setSelectedPdvs([]); setSelectedRoutines([]); setSelectedUsers([]); setSelectedPriorities([]); setSelectedStatus([]);
    const today = getLocalDate(); setDateFrom(today); setDateTo(today);
  };

  const hasActiveFilters = selectedPdvs.length > 0 || selectedRoutines.length > 0 || selectedUsers.length > 0 || selectedPriorities.length > 0 || selectedStatus.length > 0;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {profile?.role === 'administrador' ? `Hola, ${profile?.nombre}` : "Dashboard Operativo"}
          </h2>
          <p className="text-muted-foreground mt-1">
            {profile?.role === 'administrador' 
              ? "Aquí tienes el resumen de tu actividad reciente." 
              : "Visión general del cumplimiento y rendimiento en tiempo real."}
          </p>
        </div>
        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="text-destructive hover:text-destructive">
              <X className="w-4 h-4 mr-2" /> Limpiar Filtros
            </Button>
          )}
          <Button size="sm" onClick={fetchDashboardData} className="shadow-lg hover:shadow-xl transition-all">
            <Search className="w-4 h-4 mr-2" /> Actualizar Datos
          </Button>
        </div>
      </div>

      {/* Panel de Filtros - Minimalista */}
      <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Filter className="w-4 h-4 text-primary" /> Filtros de Análisis
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Desde</Label>
              <Input type="date" className="h-9 text-sm bg-background border-border/50" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Hasta</Label>
              <Input type="date" className="h-9 text-sm bg-background border-border/50" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Puntos de Venta</Label>
              <MultiSelect options={pdvOptions} selected={selectedPdvs} onChange={setSelectedPdvs} placeholder="Todos los PDV" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Rutinas</Label>
              <MultiSelect options={routineOptions} selected={selectedRoutines} onChange={setSelectedRoutines} placeholder="Todas las Rutinas" />
            </div>
            {profile?.role !== 'administrador' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Usuarios</Label>
                <MultiSelect options={userOptions} selected={selectedUsers} onChange={setSelectedUsers} placeholder="Todos los Usuarios" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Estado / Prioridad</Label>
              <div className="flex gap-1">
                 <MultiSelect options={priorityOptions} selected={selectedPriorities} onChange={setSelectedPriorities} placeholder="Prioridad" className="w-1/2" />
                 <MultiSelect options={statusOptions} selected={selectedStatus} onChange={setSelectedStatus} placeholder="Estado" className="w-1/2" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Cumplimiento" 
          value={`${stats.compliance}%`} 
          description="Eficacia global"
          icon={Activity}
          loading={loading}
          colorClass={stats.compliance >= 90 ? "text-primary" : stats.compliance >= 70 ? "text-yellow-500" : "text-destructive"}
        />
        <StatCard 
          title="Total Tareas" 
          value={stats.totalTasks}
          description="Generadas en periodo" 
          icon={BarChart3}
          loading={loading}
          colorClass="text-blue-500"
        />
        <StatCard 
          title="Pendientes" 
          value={stats.pendingTasks}
          description="En cola de ejecución" 
          icon={Clock}
          colorClass="text-orange-500"
          loading={loading}
        />
        <StatCard 
          title="Críticas" 
          value={stats.criticalPending}
          description="Prioridad alta sin resolver" 
          icon={AlertTriangle}
          colorClass={stats.criticalPending > 0 ? "text-destructive" : "text-muted-foreground"}
          loading={loading}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Gráfico */}
        <Card className="col-span-4 border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Tendencia de Ejecución
            </CardTitle>
            <CardDescription>Comportamiento diario de cumplimiento vs fallos.</CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            <div className="h-[350px] w-full">
              {!loading && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                    <XAxis 
                      dataKey="name" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      dy={10}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      dx={-10}
                    />
                    <Tooltip 
                      cursor={{fill: 'hsl(var(--muted)/0.3)'}}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        borderRadius: '12px', 
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        color: 'hsl(var(--popover-foreground))'
                      }}
                    />
                    <Bar dataKey="Completadas" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 4, 4]} name="Completadas" barSize={32} />
                    <Bar dataKey="Incumplidas" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Incumplidas" barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/10 rounded-xl">
                  <BarChart3 className="w-12 h-12 mb-3 opacity-20" />
                  <p>{loading ? "Calculando..." : "No hay datos para graficar"}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actividad Reciente */}
        <Card className="col-span-3 border-none shadow-md flex flex-col">
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
            <CardDescription>Últimos movimientos registrados</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto max-h-[400px] custom-scrollbar pr-2">
            <div className="space-y-4">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60 py-12">
                  <Activity className="w-10 h-10 mb-2" />
                  <p className="text-sm">Sin actividad reciente</p>
                </div>
              ) : (
                recentActivity.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50 group">
                    <div className="shrink-0 mt-0.5">
                      {task.estado.startsWith('completada') ? (
                        <div className="bg-primary/20 p-2 rounded-full text-primary">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      ) : task.estado === 'incumplida' ? (
                        <div className="bg-destructive/20 p-2 rounded-full text-destructive">
                          <X className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="bg-blue-500/20 p-2 rounded-full text-blue-600">
                          <Clock className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-semibold leading-tight truncate pr-2">
                          {task.routine_templates?.nombre}
                        </p>
                        <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                          {format(parseLocalDate(task.fecha_programada), 'dd/MM')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {task.pdv?.nombre}
                        </p>
                        <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground truncate max-w-[100px]">
                          {task.profiles?.nombre || 'S/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;