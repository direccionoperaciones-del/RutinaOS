import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, AlertTriangle, Clock, TrendingUp, BarChart3, Plus, Mail, CalendarOff } from "lucide-react";
import { format, subDays, startOfDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const StatCard = ({ title, value, description, icon: Icon, colorClass }: any) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">
        {title}
      </CardTitle>
      <Icon className={`h-4 w-4 ${colorClass || "text-muted-foreground"}`} />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground">
        {description}
      </p>
    </CardContent>
  </Card>
);

const Index = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    compliance: 0,
    criticalPending: 0,
    avgTime: "0m"
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Get User Role for permissions
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setUserRole(profile?.role || "");
      }

      const today = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = subDays(new Date(), 6).toISOString().split('T')[0];

      // 1. Fetch Tareas de Hoy (Stats Cards)
      const { data: tasksToday } = await supabase
        .from('task_instances')
        .select(`
          id,
          estado,
          prioridad_snapshot,
          completado_at,
          created_at,
          routine_templates (nombre),
          pdv (nombre),
          profiles:completado_por (nombre)
        `)
        .eq('fecha_programada', today);

      if (tasksToday) {
        const total = tasksToday.length;
        const completed = tasksToday.filter(t => t.estado === 'completada').length;
        const pending = total - completed;
        const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        const critical = tasksToday.filter(t => 
          (t.prioridad_snapshot === 'alta' || t.prioridad_snapshot === 'critica') && 
          t.estado !== 'completada'
        ).length;

        setStats({
          totalTasks: total,
          completedTasks: completed,
          pendingTasks: pending,
          compliance,
          criticalPending: critical,
          avgTime: "15m"
        });

        // Actividad Reciente
        const sorted = [...tasksToday].sort((a, b) => {
          const dateA = new Date(a.completado_at || a.created_at).getTime();
          const dateB = new Date(b.completado_at || b.created_at).getTime();
          return dateB - dateA;
        }).slice(0, 5);
        setRecentActivity(sorted);
      }

      // 2. Fetch Datos para Gráfico (Últimos 7 días)
      const { data: tasksWeek } = await supabase
        .from('task_instances')
        .select('fecha_programada, estado')
        .gte('fecha_programada', sevenDaysAgo)
        .lte('fecha_programada', today);

      if (tasksWeek) {
        // Agrupar por fecha
        const grouped = tasksWeek.reduce((acc: any, curr) => {
          const date = curr.fecha_programada;
          if (!acc[date]) {
            acc[date] = { date, total: 0, completed: 0 };
          }
          acc[date].total++;
          if (curr.estado === 'completada') {
            acc[date].completed++;
          }
          return acc;
        }, {});

        // Formatear para Recharts (rellenando días vacíos si es necesario, aquí simplificado)
        // Convertimos a array y ordenamos
        const chartArray = Object.values(grouped).sort((a: any, b: any) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        ).map((item: any) => ({
          name: format(parseISO(item.date), 'EEE d', { locale: es }), // Ej: Lun 20
          Total: item.total,
          Completadas: item.completed,
          Pendientes: item.total - item.completed
        }));

        setChartData(chartArray);
      }

      setLoading(false);
    };

    fetchData();

    // Suscripción Realtime
    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_instances' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) {
    return <div className="p-8 flex justify-center"><Skeleton className="h-[500px] w-full rounded-xl" /></div>;
  }

  const isAdmin = userRole === 'administrador';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Resumen operativo del {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}.
          </p>
        </div>
        
        {/* Accesos Directos */}
        <div className="flex gap-2">
          {!isAdmin && (
            <Button size="sm" variant="outline" onClick={() => navigate('/messages')}>
              <Mail className="w-4 h-4 mr-2" /> Comunicado
            </Button>
          )}
          <Button size="sm" onClick={() => navigate('/tasks')}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Mis Tareas
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Cumplimiento Hoy" 
          value={`${stats.compliance}%`} 
          description={`${stats.completedTasks} de ${stats.totalTasks} tareas`}
          icon={Activity}
          colorClass={stats.compliance >= 90 ? "text-green-500" : stats.compliance >= 70 ? "text-yellow-500" : "text-red-500"}
        />
        <StatCard 
          title="Pendientes" 
          value={stats.pendingTasks}
          description="Tareas por ejecutar hoy" 
          icon={Clock}
          colorClass="text-blue-500"
        />
        <StatCard 
          title="Alertas Críticas" 
          value={stats.criticalPending}
          description="Tareas de alta prioridad sin cerrar" 
          icon={AlertTriangle}
          colorClass={stats.criticalPending > 0 ? "text-red-500" : "text-muted-foreground"}
        />
        <StatCard 
          title="Total Programado" 
          value={stats.totalTasks}
          description="Carga operativa del día" 
          icon={BarChart3}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Gráfico Real */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Rendimiento Semanal
            </CardTitle>
            <CardDescription>Volumen de tareas y cumplimiento de los últimos 7 días.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              {chartData.length > 0 ? (
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
                      tickFormatter={(value) => `${value}`} 
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}
                      cursor={{fill: 'var(--muted)'}}
                    />
                    <Bar dataKey="Completadas" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="Pendientes" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/10 rounded-md border-2 border-dashed">
                  <p>No hay datos suficientes esta semana</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="col-span-3 flex flex-col">
          <CardHeader>
            <CardTitle>Actividad en Vivo</CardTitle>
            <CardDescription>Últimos eventos registrados hoy</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-6">
              {recentActivity.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
                  <Activity className="w-10 h-10 mb-2" />
                  <p className="text-sm">Sin actividad hoy</p>
                </div>
              ) : (
                recentActivity.map((task) => (
                  <div key={task.id} className="flex items-center group">
                    <span className="relative flex h-2 w-2 mr-4 shrink-0">
                      {task.estado === 'completada' ? (
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500 animate-pulse"></span>
                      )}
                    </span>
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <p className="text-sm font-medium leading-none truncate group-hover:text-primary transition-colors">
                        {task.routine_templates?.nombre}
                      </p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <span>{task.pdv?.nombre}</span>
                        <span>•</span>
                        <span className={task.estado === 'completada' ? "text-green-600 font-medium" : ""}>
                          {task.estado === 'completada' ? 'Completada' : 'Pendiente'}
                        </span>
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap ml-2 font-mono">
                       {task.completado_at 
                        ? format(new Date(task.completado_at), "HH:mm") 
                        : format(new Date(task.created_at), "HH:mm")}
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