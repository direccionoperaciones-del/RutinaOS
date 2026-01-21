import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, AlertTriangle, Clock, TrendingUp, BarChart3, Filter, X, Calendar as CalendarIcon, Search } from "lucide-react";
import { format, subDays, parseISO, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// Componente Tarjeta KPI
const StatCard = ({ title, value, description, icon: Icon, colorClass, loading }: any) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">
        {title}
      </CardTitle>
      <Icon className={`h-4 w-4 ${colorClass || "text-muted-foreground"}`} />
    </CardHeader>
    <CardContent>
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <>
          <div className="text-2xl font-bold">{value}</div>
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        </>
      )}
    </CardContent>
  </Card>
);

const Index = () => {
  const navigate = useNavigate();
  
  // --- ESTADOS DE FILTROS ---
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  
  const [filterPdv, setFilterPdv] = useState("all");
  const [filterRoutine, setFilterRoutine] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // --- ESTADOS DE DATOS ---
  const [loading, setLoading] = useState(true);
  const [loadingFilters, setLoadingFilters] = useState(true);
  
  // Listas para dropdowns
  const [pdvs, setPdvs] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Datos procesados
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    compliance: 0,
    criticalPending: 0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  // 1. CARGAR OPCIONES DE FILTROS (Solo una vez)
  useEffect(() => {
    const loadFilterOptions = async () => {
      const { data: pdvData } = await supabase.from('pdv').select('id, nombre').eq('activo', true).order('nombre');
      const { data: routData } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true).order('nombre');
      const { data: userData } = await supabase.from('profiles').select('id, nombre, apellido').eq('activo', true).order('nombre');
      
      setPdvs(pdvData || []);
      setRoutines(routData || []);
      setUsers(userData || []);
      setLoadingFilters(false);
    };
    loadFilterOptions();
  }, []);

  // 2. CARGAR DASHBOARD (Cada vez que cambian los filtros)
  const fetchDashboardData = async () => {
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

    // Aplicar Filtros Dinámicos
    if (filterPdv !== 'all') query = query.eq('pdv_id', filterPdv);
    if (filterRoutine !== 'all') query = query.eq('rutina_id', filterRoutine);
    if (filterUser !== 'all') query = query.eq('completado_por', filterUser); // Nota: Solo filtra tareas YA completadas por este usuario
    if (filterPriority !== 'all') query = query.eq('prioridad_snapshot', filterPriority);
    
    // Filtro de Estado Manual (además del query)
    if (filterStatus !== 'all') {
      if (filterStatus === 'pendiente') query = query.in('estado', ['pendiente', 'en_proceso']);
      else query = query.eq('estado', filterStatus);
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error("Error fetching dashboard:", error);
      setLoading(false);
      return;
    }

    // --- PROCESAMIENTO DE KPIs ---
    const total = tasks.length;
    const completed = tasks.filter(t => t.estado === 'completada' || t.estado === 'completada_vencida').length;
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

    // --- ACTIVIDAD RECIENTE (Top 10 del filtro actual) ---
    const activity = [...tasks]
      .sort((a, b) => {
        const dateA = new Date(a.completado_at || a.created_at).getTime();
        const dateB = new Date(b.completado_at || b.created_at).getTime();
        return dateB - dateA; // Más recientes primero
      })
      .slice(0, 10);
    setRecentActivity(activity);

    // --- GRÁFICO (Agrupado por Fecha) ---
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
        name: format(parseISO(item.date), 'dd MMM', { locale: es }),
        Total: item.total,
        Completadas: item.completed,
        Incumplidas: item.failed
      }));

    setChartData(chartArray);
    setLoading(false);
  };

  // Trigger fetch cuando cambian los filtros
  useEffect(() => {
    fetchDashboardData();
  }, [dateFrom, dateTo, filterPdv, filterRoutine, filterUser, filterPriority, filterStatus]);

  const clearFilters = () => {
    setFilterPdv("all");
    setFilterRoutine("all");
    setFilterUser("all");
    setFilterPriority("all");
    setFilterStatus("all");
    // Resetear fechas a HOY
    const today = new Date().toISOString().split('T')[0];
    setDateFrom(today);
    setDateTo(today);
  };

  const hasActiveFilters = 
    filterPdv !== "all" || 
    filterRoutine !== "all" || 
    filterUser !== "all" || 
    filterPriority !== "all" ||
    filterStatus !== "all";

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard Operativo</h2>
          <p className="text-muted-foreground">
            Monitoreo en tiempo real y análisis de cumplimiento.
          </p>
        </div>
        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="text-destructive hover:text-destructive">
              <X className="w-4 h-4 mr-2" /> Limpiar Filtros
            </Button>
          )}
          <Button size="sm" onClick={fetchDashboardData}>
            <Search className="w-4 h-4 mr-2" /> Actualizar Datos
          </Button>
        </div>
      </div>

      {/* --- BARRA DE FILTROS --- */}
      <Card className="bg-muted/20 border-primary/10">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Filter className="w-4 h-4" /> Filtros de Análisis
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Fechas */}
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" className="h-8 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" className="h-8 text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            {/* Selectores */}
            <div className="space-y-1">
              <Label className="text-xs">Punto de Venta</Label>
              <Select value={filterPdv} onValueChange={setFilterPdv}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {pdvs.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Rutina</Label>
              <Select value={filterRoutine} onValueChange={setFilterRoutine}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {routines.map(r => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Administrador/Usuario</Label>
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre} {u.apellido}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Prioridad / Alerta</Label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">🔴 Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- KPIs --- */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Cumplimiento" 
          value={`${stats.compliance}%`} 
          description="Sobre tareas filtradas"
          icon={Activity}
          loading={loading}
          colorClass={stats.compliance >= 90 ? "text-green-500" : stats.compliance >= 70 ? "text-yellow-500" : "text-red-500"}
        />
        <StatCard 
          title="Total Tareas" 
          value={stats.totalTasks}
          description="Generadas en periodo" 
          icon={BarChart3}
          loading={loading}
        />
        <StatCard 
          title="Pendientes" 
          value={stats.pendingTasks}
          description="Por ejecutar" 
          icon={Clock}
          colorClass="text-blue-500"
          loading={loading}
        />
        <StatCard 
          title="Alertas Activas" 
          value={stats.criticalPending}
          description="Críticas sin resolver" 
          icon={AlertTriangle}
          colorClass={stats.criticalPending > 0 ? "text-red-500" : "text-muted-foreground"}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* --- GRÁFICO --- */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Tendencia de Ejecución
            </CardTitle>
            <CardDescription>Comportamiento diario según filtros aplicados.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              {!loading && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}
                      cursor={{fill: 'var(--muted)'}}
                    />
                    <Bar dataKey="Completadas" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} name="Completadas" />
                    <Bar dataKey="Incumplidas" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} name="Incumplidas" />
                    <Bar dataKey="Total" stackId="b" fill="transparent" /> {/* Solo para escala */}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/10 rounded-md border-2 border-dashed">
                  <p>{loading ? "Calculando..." : "No hay datos para graficar en este rango"}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* --- LISTADO ACTIVIDAD --- */}
        <Card className="col-span-3 flex flex-col">
          <CardHeader>
            <CardTitle>Detalle de Actividad</CardTitle>
            <CardDescription>Últimos registros filtrados</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto max-h-[350px]">
            <div className="space-y-4">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60 py-8">
                  <Activity className="w-10 h-10 mb-2" />
                  <p className="text-sm">Sin resultados</p>
                </div>
              ) : (
                recentActivity.map((task) => (
                  <div key={task.id} className="flex items-center group p-2 hover:bg-muted/50 rounded-md transition-colors">
                    <div className="mr-3">
                      {task.estado === 'completada' ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : task.estado === 'incumplida' ? (
                        <X className="w-5 h-5 text-red-500" />
                      ) : (
                        <Clock className="w-5 h-5 text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <div className="flex justify-between">
                        <p className="text-sm font-medium leading-none truncate">
                          {task.routine_templates?.nombre}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(task.fecha_programada), 'dd/MM')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <span className="font-medium text-foreground">{task.pdv?.nombre}</span>
                        <span>•</span>
                        <span>{task.profiles?.nombre || 'Sin asignar'}</span>
                      </p>
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