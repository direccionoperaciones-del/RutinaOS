import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, AlertTriangle, Clock, TrendingUp, BarChart3, Filter, X, Calendar as CalendarIcon, Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { useCurrentUser } from "@/hooks/use-current-user";

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
  const { profile, user, loading: loadingUser } = useCurrentUser();

  // --- ESTADOS DE FILTROS ---
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  
  // Ahora son arrays para soportar selección múltiple
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);

  // --- ESTADOS DE DATOS ---
  const [loading, setLoading] = useState(true);
  
  // Opciones para los multiselects {label, value}
  const [pdvOptions, setPdvOptions] = useState<{label: string, value: string}[]>([]);
  const [routineOptions, setRoutineOptions] = useState<{label: string, value: string}[]>([]);
  const [userOptions, setUserOptions] = useState<{label: string, value: string}[]>([]);

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

  // 1. CARGAR OPCIONES
  useEffect(() => {
    const loadFilterOptions = async () => {
      const { data: pdvData } = await supabase.from('pdv').select('id, nombre').eq('activo', true).order('nombre');
      const { data: routData } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true).order('nombre');
      
      setPdvOptions(pdvData?.map(p => ({ label: p.nombre, value: p.id })) || []);
      setRoutineOptions(routData?.map(r => ({ label: r.nombre, value: r.id })) || []);

      // Solo cargar usuarios si NO es administrador (el admin no filtra por otros)
      if (profile?.role !== 'administrador') {
        const { data: userData } = await supabase.from('profiles').select('id, nombre, apellido').eq('activo', true).order('nombre');
        setUserOptions(userData?.map(u => ({ label: `${u.nombre} ${u.apellido}`, value: u.id })) || []);
      }
    };
    
    if (profile) loadFilterOptions();
  }, [profile]);

  // 2. CARGAR DASHBOARD (Cada vez que cambian los filtros)
  const fetchDashboardData = async () => {
    if (!profile || !user) return;
    
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

    // --- RESTRICCIÓN DE SEGURIDAD PARA ADMINISTRADOR ---
    if (profile.role === 'administrador') {
      // El administrador SOLO ve sus tareas (asignadas o completadas por él)
      // Usamos responsable_id para lo pendiente y completado_por para lo histórico
      query = query.or(`responsable_id.eq.${user.id},completado_por.eq.${user.id}`);
    } else {
      // Si no es admin, permitimos el filtro de usuarios del UI
      if (selectedUsers.length > 0) query = query.in('completado_por', selectedUsers);
    }

    // Aplicar Filtros Dinámicos Comunes
    if (selectedPdvs.length > 0) query = query.in('pdv_id', selectedPdvs);
    if (selectedRoutines.length > 0) query = query.in('rutina_id', selectedRoutines);
    if (selectedPriorities.length > 0) query = query.in('prioridad_snapshot', selectedPriorities);
    
    // Filtro de Estado Especial
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

    // --- PROCESAMIENTO DE KPIs ---
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

    // --- ACTIVIDAD RECIENTE (Top 10) ---
    const activity = [...tasks]
      .sort((a, b) => {
        const dateA = new Date(a.completado_at || a.created_at).getTime();
        const dateB = new Date(b.completado_at || b.created_at).getTime();
        return dateB - dateA;
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

  useEffect(() => {
    fetchDashboardData();
  }, [dateFrom, dateTo, selectedPdvs, selectedRoutines, selectedUsers, selectedPriorities, selectedStatus, profile, user]);

  const clearFilters = () => {
    setSelectedPdvs([]);
    setSelectedRoutines([]);
    setSelectedUsers([]);
    setSelectedPriorities([]);
    setSelectedStatus([]);
    const today = new Date().toISOString().split('T')[0];
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
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard Operativo</h2>
          <p className="text-muted-foreground">
            {profile?.role === 'administrador' 
              ? "Tus métricas de desempeño personal." 
              : "Monitoreo en tiempo real y análisis de cumplimiento global."}
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
              <Input type="date" className="h-8 text-xs bg-background" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" className="h-8 text-xs bg-background" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            {/* Selectores Múltiples */}
            <div className="space-y-1">
              <Label className="text-xs">Puntos de Venta</Label>
              <MultiSelect 
                options={pdvOptions} 
                selected={selectedPdvs} 
                onChange={setSelectedPdvs} 
                placeholder="Todos los PDV"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Rutinas</Label>
              <MultiSelect 
                options={routineOptions} 
                selected={selectedRoutines} 
                onChange={setSelectedRoutines} 
                placeholder="Todas las Rutinas"
              />
            </div>

            {/* El filtro de USUARIOS solo se muestra si NO es administrador */}
            {profile?.role !== 'administrador' && (
              <div className="space-y-1">
                <Label className="text-xs">Usuarios</Label>
                <MultiSelect 
                  options={userOptions} 
                  selected={selectedUsers} 
                  onChange={setSelectedUsers} 
                  placeholder="Todos los Usuarios"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Prioridad / Estado</Label>
              <div className="flex gap-1">
                 <MultiSelect 
                  options={priorityOptions} 
                  selected={selectedPriorities} 
                  onChange={setSelectedPriorities} 
                  placeholder="Prioridad"
                  className="w-1/2"
                />
                 <MultiSelect 
                  options={statusOptions} 
                  selected={selectedStatus} 
                  onChange={setSelectedStatus} 
                  placeholder="Estado"
                  className="w-1/2"
                />
              </div>
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
            <CardDescription>Comportamiento diario.</CardDescription>
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
            <CardDescription>Últimos registros</CardDescription>
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
                      {task.estado.startsWith('completada') ? (
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