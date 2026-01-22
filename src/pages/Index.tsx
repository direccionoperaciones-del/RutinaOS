import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, AlertTriangle, Clock, TrendingUp, BarChart3, Filter, X, Calendar as CalendarIcon, Search, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getLocalDate, parseLocalDate } from "@/lib/utils";

// Componente Tarjeta KPI Rediseñado
const StatCard = ({ title, value, description, icon: Icon, colorBg, colorText, loading }: any) => (
  <Card className="overflow-hidden border-none shadow-soft hover:shadow-md transition-shadow">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-full ${colorBg || "bg-slate-100"}`}>
          <Icon className={`h-6 w-6 ${colorText || "text-slate-600"}`} />
        </div>
        {/* Placeholder para porcentaje de cambio si existiera */}
        <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
          <ArrowUpRight className="h-3 w-3" />
          <span>Activo</span>
        </div>
      </div>
      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-8 w-24 mb-1" />
        ) : (
          <h2 className="text-3xl font-bold text-movacheck-navy dark:text-white">{value}</h2>
        )}
        <p className="text-sm text-muted-foreground font-medium mt-1">{title}</p>
        <p className="text-xs text-slate-400 mt-2">{description}</p>
      </div>
    </CardContent>
  </Card>
);

const Index = () => {
  const { profile, user, loading: loadingUser } = useCurrentUser();

  // Inicializar estados con la fecha local calculada
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
        id,
        estado,
        prioridad_snapshot,
        completado_at,
        created_at,
        fecha_programada,
        routine_templates (nombre),
        pdv (nombre),
        profiles:completado_por (nombre, apellido)
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
      if (selectedStatus.includes("pendiente")) {
        statusesToFilter.push("pendiente", "en_proceso");
      }
      selectedStatus.forEach(s => {
        if (s !== "pendiente") statusesToFilter.push(s);
      });
      query = query.in('estado', statusesToFilter);
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error("Error fetching dashboard:", error);
      setLoading(false);
      return;
    }

    const total = tasks.length;
    const completed = tasks.filter(t => t.estado.startsWith('completada')).length;
    const pending = tasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso').length;
    const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const critical = tasks.filter(t => 
      (t.prioridad_snapshot === 'alta' || t.prioridad_snapshot === 'critica') && 
      (t.estado === 'pendiente' || t.estado === 'incumplida')
    ).length;

    setStats({
      totalTasks: total,
      completedTasks: completed,
      pendingTasks: pending,
      compliance,
      criticalPending: critical,
    });

    const activity = [...tasks]
      .sort((a, b) => {
        const dateA = new Date(a.completado_at || a.created_at).getTime();
        const dateB = new Date(b.completado_at || b.created_at).getTime();
        return dateB - dateA;
      })
      .slice(0, 10);
    setRecentActivity(activity);

    const groupedData = tasks.reduce((acc: any, curr) => {
      const date = curr.fecha_programada;
      if (!acc[date]) {
        acc[date] = { date, total: 0, completed: 0, failed: 0 };
      }
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
    setSelectedPdvs([]);
    setSelectedRoutines([]);
    setSelectedUsers([]);
    setSelectedPriorities([]);
    setSelectedStatus([]);
    const today = getLocalDate();
    setDateFrom(today);
    setDateTo(today);
  };

  const hasActiveFilters = 
    selectedPdvs.length > 0 || 
    selectedRoutines.length > 0 || 
    selectedUsers.length > 0 || 
    selectedPriorities.length > 0 ||
    selectedStatus.length > 0;

  return (
    <div className="space-y-8 pb-20">
      
      {/* Header Sección */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-movacheck-navy dark:text-white">Dashboard Operativo</h2>
          <p className="text-muted-foreground mt-1">
            {profile?.role === 'administrador' 
              ? "Tus métricas de desempeño personal." 
              : "Visión general del estado de cumplimiento en tiempo real."}
          </p>
        </div>
        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="text-destructive hover:text-destructive">
              <X className="w-4 h-4 mr-2" /> Limpiar
            </Button>
          )}
          <Button size="sm" onClick={fetchDashboardData} className="bg-movacheck-primary text-movacheck-navy hover:bg-movacheck-hover">
            <Search className="w-4 h-4 mr-2" /> Actualizar
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Cumplimiento" 
          value={`${stats.compliance}%`} 
          description="Efectividad total"
          icon={Activity}
          colorBg={stats.compliance >= 90 ? "bg-emerald-100" : stats.compliance >= 70 ? "bg-amber-100" : "bg-rose-100"}
          colorText={stats.compliance >= 90 ? "text-emerald-600" : stats.compliance >= 70 ? "text-amber-600" : "text-rose-600"}
          loading={loading}
        />
        <StatCard 
          title="Total Tareas" 
          value={stats.totalTasks}
          description="Generadas en periodo" 
          icon={BarChart3}
          colorBg="bg-indigo-100"
          colorText="text-indigo-600"
          loading={loading}
        />
        <StatCard 
          title="Pendientes" 
          value={stats.pendingTasks}
          description="En cola de ejecución" 
          icon={Clock}
          colorBg="bg-blue-100"
          colorText="text-blue-600"
          loading={loading}
        />
        <StatCard 
          title="Alertas Críticas" 
          value={stats.criticalPending}
          description="Alta prioridad pendientes" 
          icon={AlertTriangle}
          colorBg="bg-rose-100"
          colorText="text-rose-600"
          loading={loading}
        />
      </div>

      {/* Main Grid: Filters + Charts */}
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-3">
        
        {/* Filtros (Columna Izquierda o Arriba en mobile) */}
        <div className="xl:col-span-1 space-y-6">
          <Card className="bg-white dark:bg-card">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="w-4 h-4 text-movacheck-primary" /> Filtros Activos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase">Desde</Label>
                  <Input type="date" className="h-9 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase">Hasta</Label>
                  <Input type="date" className="h-9 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Punto de Venta</Label>
                <MultiSelect 
                  options={pdvOptions} 
                  selected={selectedPdvs} 
                  onChange={setSelectedPdvs} 
                  placeholder="Todos los PDV"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Rutinas</Label>
                <MultiSelect 
                  options={routineOptions} 
                  selected={selectedRoutines} 
                  onChange={setSelectedRoutines} 
                  placeholder="Todas las Rutinas"
                />
              </div>

              {profile?.role !== 'administrador' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase">Responsable</Label>
                  <MultiSelect 
                    options={userOptions} 
                    selected={selectedUsers} 
                    onChange={setSelectedUsers} 
                    placeholder="Todos los Usuarios"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Gráfico y Actividad (2/3 ancho) */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Tendencia de Ejecución</CardTitle>
                  <CardDescription>Comportamiento diario de tareas.</CardDescription>
                </div>
                <div className="p-2 bg-movacheck-primary/10 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-movacheck-primary" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {!loading && chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis 
                        dataKey="name" 
                        stroke="#94A3B8" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        dy={10}
                      />
                      <YAxis 
                        stroke="#94A3B8" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        cursor={{fill: 'var(--muted)'}}
                      />
                      <Bar dataKey="Completadas" stackId="a" fill="#34D399" radius={[0, 0, 4, 4]} barSize={32} />
                      <Bar dataKey="Incumplidas" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} barSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/10 rounded-2xl border-2 border-dashed border-muted">
                    <p>{loading ? "Calculando..." : "No hay datos para graficar"}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity List */}
          <Card>
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
              <CardDescription>Últimas 10 tareas procesadas.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loading ? (
                  <div className="space-y-3">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
                  </div>
                ) : recentActivity.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground opacity-60">
                    <Activity className="w-10 h-10 mb-2 mx-auto" />
                    <p className="text-sm">Sin actividad reciente</p>
                  </div>
                ) : (
                  recentActivity.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-800">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full shrink-0 ${
                          task.estado.startsWith('completada') ? 'bg-emerald-100 text-emerald-600' : 
                          task.estado === 'incumplida' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                          {task.estado.startsWith('completada') ? <CheckCircle2 className="w-4 h-4" /> : 
                           task.estado === 'incumplida' ? <X className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {task.routine_templates?.nombre}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-slate-500">{task.pdv?.nombre}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                            <span>{task.profiles?.nombre || 'Sin asignar'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right pl-4">
                        <p className="text-xs font-mono text-slate-500">
                          {format(parseLocalDate(task.fecha_programada), 'dd/MM')}
                        </p>
                        {task.prioridad_snapshot === 'critica' && (
                          <span className="inline-block mt-1 w-2 h-2 rounded-full bg-red-500" title="Crítica" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};

export default Index;