import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Activity, CheckCircle2, AlertTriangle, Clock, TrendingUp, 
  BarChart3, Filter, X, Search, ArrowUpRight, 
  AlertOctagon, Users, ListChecks, PieChart as PieChartIcon
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell 
} from 'recharts';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getLocalDate, parseLocalDate } from "@/lib/utils";

// --- COLORES SEMÁNTICOS PARA ESTADOS ---
const COLORS = {
  a_tiempo: "#34D399",  // Verde Mint
  vencida: "#F59E0B",   // Naranja Ambar
  pendiente: "#3B82F6", // Azul
  incumplida: "#EF4444" // Rojo
};

// --- COMPONENTES UI AUXILIARES ---

const StatCard = ({ title, value, description, icon: Icon, colorBg, colorText, loading }: any) => (
  <Card className="overflow-hidden border-slate-200 shadow-soft hover:shadow-card-hover transition-all group">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-2xl transition-colors ${colorBg || "bg-slate-100"}`}>
          <Icon className={`h-6 w-6 transition-colors ${colorText || "text-slate-600"}`} />
        </div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowUpRight className="h-3 w-3" />
          <span>LIVE</span>
        </div>
      </div>
      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-8 w-24 mb-1" />
        ) : (
          <h2 className="text-3xl font-bold text-movacheck-navy dark:text-white tracking-tight">{value}</h2>
        )}
        <p className="text-sm text-slate-500 font-medium mt-1">{title}</p>
        <p className="text-xs text-slate-400 mt-2 line-clamp-1">{description}</p>
      </div>
    </CardContent>
  </Card>
);

const SectionHeader = ({ title, description, icon: Icon }: any) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="p-2 bg-movacheck-blue/10 rounded-lg">
      <Icon className="w-5 h-5 text-movacheck-blue" />
    </div>
    <div>
      <h3 className="text-lg font-bold text-movacheck-navy dark:text-white leading-none">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  </div>
);

// Custom Tooltip para Rutinas con Porcentajes
const CustomRoutineTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const total = data.cumples + data.fallas;
    const pctCumples = total > 0 ? Math.round((data.cumples / total) * 100) : 0;
    const pctFallas = 100 - pctCumples;

    return (
      <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg text-xs">
        <p className="font-bold mb-2 text-slate-700">{label}</p>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <span className="text-slate-600">Cumplimiento:</span>
          <span className="font-bold ml-auto">{data.cumples} ({pctCumples}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-slate-200"></div>
          <span className="text-slate-600">Pendiente/Fallo:</span>
          <span className="font-bold ml-auto">{data.fallas} ({pctFallas}%)</span>
        </div>
      </div>
    );
  }
  return null;
};

// --- COMPONENTE PRINCIPAL ---

const Index = () => {
  const { profile, user, loading: loadingUser } = useCurrentUser();

  // Filtros
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  
  // Datos Maestros
  const [pdvOptions, setPdvOptions] = useState<{label: string, value: string}[]>([]);
  const [routineOptions, setRoutineOptions] = useState<{label: string, value: string}[]>([]);
  const [userOptions, setUserOptions] = useState<{label: string, value: string}[]>([]);

  // Estados de Datos
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalTasks: 0, completedTasks: 0, pendingTasks: 0, compliance: 0, criticalAlerts: 0 });
  
  // Datasets Gráficos
  const [trendData, setTrendData] = useState<any[]>([]); 
  const [alertsData, setAlertsData] = useState<any[]>([]);
  const [routineData, setRoutineData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]); // NUEVO: Data para PieChart
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Inicialización
  useEffect(() => {
    const today = getLocalDate();
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // Cargar Opciones
  useEffect(() => {
    const loadOptions = async () => {
      const { data: pdvData } = await supabase.from('pdv').select('id, nombre').eq('activo', true).order('nombre');
      const { data: routData } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true).order('nombre');
      
      setPdvOptions(pdvData?.map(p => ({ label: p.nombre, value: p.id })) || []);
      setRoutineOptions(routData?.map(r => ({ label: r.nombre, value: r.id })) || []);

      if (profile?.role !== 'administrador') {
        const { data: userData } = await supabase.from('profiles').select('id, nombre, apellido').eq('activo', true).order('nombre');
        setUserOptions(userData?.map(u => ({ label: `${u.nombre} ${u.apellido}`, value: u.id })) || []);
      }
    };
    if (profile) loadOptions();
  }, [profile]);

  // --- MOTOR DE DATOS ---
  const fetchDashboardData = async () => {
    if (!profile || !user || !dateFrom || !dateTo) return;
    setLoading(true);

    let query = supabase
      .from('task_instances')
      .select(`
        id, estado, prioridad_snapshot, completado_at, created_at, fecha_programada, audit_status,
        routine_templates (nombre),
        pdv (nombre),
        profiles:completado_por (nombre, apellido)
      `)
      .gte('fecha_programada', dateFrom)
      .lte('fecha_programada', dateTo);

    if (profile.role === 'administrador') {
      query = query.or(`responsable_id.eq.${user.id},completado_por.eq.${user.id}`);
    } else if (selectedUsers.length > 0) {
      query = query.in('completado_por', selectedUsers);
    }
    if (selectedPdvs.length > 0) query = query.in('pdv_id', selectedPdvs);
    if (selectedRoutines.length > 0) query = query.in('rutina_id', selectedRoutines);

    const { data: tasks, error } = await query;
    if (error) { console.error(error); setLoading(false); return; }

    // 1. KPIs GLOBALES
    const total = tasks.length;
    const completed = tasks.filter(t => t.estado.startsWith('completada')).length;
    const pending = tasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso').length;
    const critical = tasks.filter(t => t.prioridad_snapshot === 'critica' || t.audit_status === 'rechazado').length;
    
    setStats({
      totalTasks: total,
      completedTasks: completed,
      pendingTasks: pending,
      compliance: total > 0 ? Math.round((completed / total) * 100) : 0,
      criticalAlerts: critical
    });

    // 2. GRÁFICO TENDENCIA (Líneas)
    const groupedByDate = tasks.reduce((acc: any, curr) => {
      const d = curr.fecha_programada;
      if (!acc[d]) acc[d] = { date: d, total: 0, completed: 0, pending: 0 };
      acc[d].total++;
      if (curr.estado.startsWith('completada')) acc[d].completed++;
      if (curr.estado === 'pendiente') acc[d].pending++;
      return acc;
    }, {});
    
    setTrendData(Object.values(groupedByDate).sort((a:any, b:any) => a.date.localeCompare(b.date)).map((i:any) => ({
      ...i, name: format(parseLocalDate(i.date), 'dd MMM', { locale: es })
    })));

    // 3. GRÁFICO ALERTAS CRÍTICAS (Barras Rojas)
    const alertsMap = tasks.reduce((acc: any, curr) => {
      if (curr.prioridad_snapshot === 'critica' || curr.audit_status === 'rechazado' || curr.estado === 'incumplida') {
        const d = curr.fecha_programada;
        if (!acc[d]) acc[d] = { date: d, count: 0 };
        acc[d].count++;
      }
      return acc;
    }, {});
    
    setAlertsData(Object.values(alertsMap).sort((a:any, b:any) => a.date.localeCompare(b.date)).map((i:any) => ({
      name: format(parseLocalDate(i.date), 'dd MMM', { locale: es }),
      Alertas: i.count
    })));

    // 4. GRÁFICO DISTRIBUCIÓN DE ESTADOS (Pie Chart) - NUEVO
    const statusCounts = {
      'a_tiempo': 0,
      'vencida': 0,
      'pendiente': 0,
      'incumplida': 0
    };

    tasks.forEach(t => {
      if (t.estado === 'completada_a_tiempo') statusCounts.a_tiempo++;
      else if (t.estado === 'completada_vencida') statusCounts.vencida++;
      else if (t.estado === 'incumplida') statusCounts.incumplida++;
      else statusCounts.pendiente++; // incluye 'en_proceso' y 'pendiente'
    });

    const statusChartData = [
      { name: 'A Tiempo', value: statusCounts.a_tiempo, color: COLORS.a_tiempo },
      { name: 'Vencida', value: statusCounts.vencida, color: COLORS.vencida },
      { name: 'Pendiente', value: statusCounts.pendiente, color: COLORS.pendiente },
      { name: 'Incumplida', value: statusCounts.incumplida, color: COLORS.incumplida },
    ].filter(i => i.value > 0); // Solo mostrar los que tienen datos

    setStatusData(statusChartData);

    // 5. CUMPLIMIENTO POR RUTINA (Stacked Bar) - MEJORADO
    const routineMap = tasks.reduce((acc: any, curr) => {
      const name = curr.routine_templates?.nombre || 'Desconocida';
      if (!acc[name]) acc[name] = { name, cumples: 0, fallas: 0 };
      
      if (curr.estado.startsWith('completada')) acc[name].cumples++;
      else acc[name].fallas++;
      return acc;
    }, {});
    
    setRoutineData(Object.values(routineMap).sort((a:any, b:any) => b.fallas - a.fallas).slice(0, 8));

    // 6. RENDIMIENTO USUARIO (Bar Chart)
    const userMap = tasks.reduce((acc: any, curr) => {
      if (!curr.profiles) return acc;
      const name = `${curr.profiles.nombre} ${curr.profiles.apellido}`;
      if (!acc[name]) acc[name] = { name, total: 0, completed: 0 };
      acc[name].total++;
      if (curr.estado.startsWith('completada')) acc[name].completed++;
      return acc;
    }, {});

    const performanceArray = Object.values(userMap)
      .map((u:any) => ({ ...u, percentage: Math.round((u.completed / u.total) * 100) }))
      .sort((a:any, b:any) => b.percentage - a.percentage)
      .slice(0, 10);
      
    setPerformanceData(performanceArray);

    // 7. ACTIVIDAD RECIENTE
    setRecentActivity([...tasks].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6));

    setLoading(false);
  };

  useEffect(() => { fetchDashboardData(); }, [dateFrom, dateTo, selectedPdvs, selectedRoutines, selectedUsers, profile]);

  const clearFilters = () => {
    const today = getLocalDate();
    setDateFrom(today); setDateTo(today);
    setSelectedPdvs([]); setSelectedRoutines([]); setSelectedUsers([]);
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-movacheck-navy dark:text-white">Dashboard Operativo</h2>
          <p className="text-muted-foreground mt-1">Visión estratégica del cumplimiento y alertas en tiempo real.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clearFilters} className="text-red-600 border-red-200 bg-white hover:bg-red-50">
            <X className="w-4 h-4 mr-2" /> Limpiar
          </Button>
          <Button size="sm" onClick={fetchDashboardData} className="bg-movacheck-blue text-white hover:bg-blue-700 shadow-md">
            <Search className="w-4 h-4 mr-2" /> Actualizar
          </Button>
        </div>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* COLUMNA IZQUIERDA: FILTROS */}
        <div className="xl:col-span-1 space-y-6">
          <Card className="bg-white dark:bg-card border-slate-200 h-fit sticky top-24">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base flex items-center gap-2 text-movacheck-blue">
                <Filter className="w-4 h-4" /> Filtros Activos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-2 xl:grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Desde</Label>
                  <Input type="date" className="h-9 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Hasta</Label>
                  <Input type="date" className="h-9 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Punto de Venta</Label>
                <MultiSelect options={pdvOptions} selected={selectedPdvs} onChange={setSelectedPdvs} placeholder="Todos los PDV" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Rutinas</Label>
                <MultiSelect options={routineOptions} selected={selectedRoutines} onChange={setSelectedRoutines} placeholder="Todas las Rutinas" />
              </div>
              {profile?.role !== 'administrador' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Responsable</Label>
                  <MultiSelect options={userOptions} selected={selectedUsers} onChange={setSelectedUsers} placeholder="Todos los Usuarios" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* COLUMNA DERECHA: DASHBOARD */}
        <div className="xl:col-span-3 space-y-6">
          
          {/* 1. KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard 
              title="Cumplimiento" 
              value={`${stats.compliance}%`} 
              description="Efectividad total"
              icon={Activity}
              colorBg={stats.compliance >= 90 ? "bg-emerald-100" : "bg-amber-100"}
              colorText={stats.compliance >= 90 ? "text-emerald-600" : "text-amber-600"}
              loading={loading}
            />
            <StatCard 
              title="Total Tareas" 
              value={stats.totalTasks}
              description="Volumen en periodo"
              icon={BarChart3}
              colorBg="bg-blue-100"
              colorText="text-blue-600"
              loading={loading}
            />
            <StatCard 
              title="Pendientes" 
              value={stats.pendingTasks}
              description="Por ejecutar hoy"
              icon={Clock}
              colorBg="bg-indigo-100"
              colorText="text-indigo-600"
              loading={loading}
            />
            <StatCard 
              title="Alertas Críticas" 
              value={stats.criticalAlerts}
              description="Alta prioridad pendientes" 
              icon={AlertOctagon}
              colorBg="bg-rose-100"
              colorText="text-rose-600"
              loading={loading}
            />
          </div>

          {/* 2. Tendencia de Ejecución (Line Chart) */}
          <Card className="border-slate-200">
            <CardHeader>
              <SectionHeader title="Tendencia Operativa" description="Evolución diaria de tareas totales, completadas y pendientes." icon={TrendingUp} />
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {!loading && trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                      <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                      <Legend verticalAlign="top" height={36}/>
                      <Line type="monotone" dataKey="Total" stroke="#2563EB" strokeWidth={2} dot={{r: 4}} />
                      <Line type="monotone" dataKey="completed" name="Completadas" stroke="#34D399" strokeWidth={2} dot={{r: 4}} />
                      <Line type="monotone" dataKey="pending" name="Pendientes" stroke="#F59E0B" strokeWidth={2} dot={{r: 4}} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground bg-slate-50 rounded-xl border-2 border-dashed">
                    <p>{loading ? "Calculando..." : "No hay datos para graficar"}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 3. GRID SECUNDARIO: Alertas y Distribución */}
          <div className="grid gap-6 md:grid-cols-2">
            
            {/* A. Alertas Críticas */}
            <Card className="border-slate-200">
              <CardHeader>
                <SectionHeader title="Alertas Críticas" description="Incidencias y tareas críticas por día." icon={AlertTriangle} />
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full">
                  {!loading && alertsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={alertsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                        <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{fill: '#FEE2E2'}} contentStyle={{ borderRadius: '8px' }}/>
                        <Bar dataKey="Alertas" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-slate-50 rounded-xl border-2 border-dashed">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2 opacity-50" />
                      <p className="text-sm">¡Sin alertas críticas!</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* B. Distribución por Estado (Donut Chart) - NUEVO */}
            <Card className="border-slate-200">
              <CardHeader>
                <SectionHeader title="Estado de Ejecución" description="Desglose por tipo de cumplimiento." icon={PieChartIcon} />
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full flex items-center justify-center">
                  {!loading && statusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {statusData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <p className="text-sm">Sin datos para mostrar</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 4. GRID TERCIARIO: Rutinas y Ranking */}
          <div className="grid gap-6 md:grid-cols-2">
            
            {/* C. Cumplimiento por Rutina (Stacked Bar + Tooltip Porcentajes) */}
            <Card className="border-slate-200">
              <CardHeader>
                <SectionHeader title="Cumplimiento por Rutina" description="Top 8 rutinas con mayor índice de fallo." icon={ListChecks} />
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  {!loading && routineData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={routineData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11, fill: '#64748B'}} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomRoutineTooltip />} cursor={{fill: 'transparent'}} />
                        <Bar dataKey="cumples" name="Cumplimiento" stackId="a" fill="#34D399" radius={[0, 0, 0, 4]} barSize={16} />
                        <Bar dataKey="fallas" name="Fallas/Pend" stackId="a" fill="#E2E8F0" radius={[0, 4, 4, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground bg-slate-50 rounded-xl">
                      <p className="text-sm">Sin datos de rutinas</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* D. Ranking Usuarios */}
            <Card className="border-slate-200">
              <CardHeader>
                <SectionHeader title="Top Rendimiento" description="Usuarios con mayor tasa de cumplimiento." icon={Users} />
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {performanceData.map((user, idx) => (
                    <div key={user.name} className="flex items-center gap-3">
                      <div className="font-mono text-xs text-slate-400 w-4 font-bold">{idx + 1}</div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 truncate max-w-[150px]">{user.name}</span>
                          <span className="font-bold text-movacheck-blue">{user.percentage}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-movacheck-blue rounded-full transition-all duration-500" 
                            style={{ width: `${user.percentage}%`, opacity: 1 - (idx * 0.05) }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {performanceData.length === 0 && <div className="text-center py-8 text-sm text-muted-foreground">Sin datos de rendimiento.</div>}
                </div>
              </CardContent>
            </Card>

          </div>

          {/* 5. Actividad Reciente */}
          <Card className="border-slate-200">
            <CardHeader>
              <SectionHeader title="Actividad en Vivo" description="Últimos eventos registrados en el sistema." icon={Activity} />
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {recentActivity.map((task, idx) => (
                  <div key={task.id} className="flex gap-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors px-2 rounded-lg">
                    <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                      task.estado.startsWith('completada') ? 'bg-emerald-500' : 'bg-amber-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {task.routine_templates?.nombre}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="font-medium">{task.pdv?.nombre}</span>
                        <span>•</span>
                        <span>{format(new Date(task.completado_at || task.created_at), 'HH:mm', { locale: es })}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      {task.prioridad_snapshot === 'critica' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">CRÍTICA</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};

export default Index;