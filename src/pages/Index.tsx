import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, AlertTriangle, Clock, TrendingUp, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch Tareas de Hoy
      const { data: tasks, error } = await supabase
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

      if (!error && tasks) {
        const total = tasks.length;
        const completed = tasks.filter(t => t.estado === 'completada').length;
        const pending = total - completed;
        const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        // Tareas críticas pendientes
        const critical = tasks.filter(t => 
          (t.prioridad_snapshot === 'alta' || t.prioridad_snapshot === 'critica') && 
          t.estado !== 'completada'
        ).length;

        setStats({
          totalTasks: total,
          completedTasks: completed,
          pendingTasks: pending,
          compliance,
          criticalPending: critical,
          avgTime: "15m" // En V2 calcular real con hora inicio/fin
        });

        // Actividad Reciente (últimas 5 completadas o creadas)
        const sorted = [...tasks].sort((a, b) => {
          const dateA = new Date(a.completado_at || a.created_at).getTime();
          const dateB = new Date(b.completado_at || b.created_at).getTime();
          return dateB - dateA;
        }).slice(0, 5);
        
        setRecentActivity(sorted);
      }
      setLoading(false);
    };

    fetchData();

    // Suscripción Realtime para actualizar dashboard
    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_instances' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
           <Skeleton className="h-8 w-48" />
           <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Resumen operativo del {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}.
        </p>
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
        {/* Gráfico Placeholder (Implementar Chart.js después) */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Rendimiento Semanal
            </CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[250px] flex items-center justify-center text-muted-foreground bg-muted/10 rounded-md border-2 border-dashed">
              <div className="text-center">
                <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p>Gráfico de cumplimiento (Próximamente)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Actividad en Vivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No hay actividad reciente hoy.</p>
              ) : (
                recentActivity.map((task) => (
                  <div key={task.id} className="flex items-center">
                    <span className="relative flex h-2 w-2 mr-4 shrink-0">
                      {task.estado === 'completada' ? (
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500 animate-pulse"></span>
                      )}
                    </span>
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <p className="text-sm font-medium leading-none truncate">
                        {task.routine_templates?.nombre}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {task.pdv?.nombre} • {task.estado === 'completada' 
                          ? `Completado por ${task.profiles?.nombre || 'Usuario'}` 
                          : 'Pendiente'}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap ml-2">
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