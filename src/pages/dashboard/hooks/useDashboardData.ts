import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getLocalDate, parseLocalDate } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DashboardStats, ChartDataPoint, StatusDataPoint, UserPerformance, FilterOptions } from "../types";

const COLORS = {
  a_tiempo: "#34D399",
  vencida: "#F59E0B",
  pendiente: "#3B82F6",
  incumplida: "#EF4444"
};

export const useDashboardData = () => {
  const { profile, user } = useCurrentUser();
  const queryClient = useQueryClient();

  // --- FILTROS ---
  const [dateFrom, setDateFrom] = useState(getLocalDate());
  const [dateTo, setDateTo] = useState(getLocalDate());
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // --- OPCIONES DE FILTRO ---
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ pdvs: [], routines: [], users: [] });

  // Cargar opciones al inicio
  useQuery({
    queryKey: ['dashboard-options', user?.id],
    enabled: !!user && !!profile,
    queryFn: async () => {
      // 1. PDVs
      const { data: pdvs } = await supabase.from('pdv').select('id, nombre').eq('activo', true).order('nombre');
      
      // 2. Rutinas
      const { data: routines } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true).order('nombre');
      
      // 3. Usuarios
      const { data: usersData } = await supabase.from('profiles').select('id, nombre, apellido').eq('activo', true).order('nombre');

      setFilterOptions({
        pdvs: pdvs?.map(p => ({ label: p.nombre, value: p.id })) || [],
        routines: routines?.map(r => ({ label: r.nombre, value: r.id })) || [],
        users: usersData?.map(u => ({ label: `${u.nombre} ${u.apellido}`, value: u.id })) || []
      });
      return true;
    }
  });

  // --- QUERY PRINCIPAL (DASHBOARD DATA) ---
  const { data: tasks = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['dashboard-data', profile?.tenant_id, dateFrom, dateTo, selectedPdvs, selectedRoutines, selectedUsers],
    enabled: !!profile && !!dateFrom && !!dateTo,
    queryFn: async () => {
      console.log("Dashboard filters:", { 
        from: dateFrom, 
        to: dateTo, 
        pdvs: selectedPdvs, 
        routines: selectedRoutines, 
        users: selectedUsers, 
        tenantId: profile?.tenant_id, 
        role: profile?.role, 
        userId: user?.id 
      });

      let query = supabase
        .from('task_instances')
        .select(`
          id, estado, prioridad_snapshot, completado_at, created_at, fecha_programada, audit_status, responsable_id, completado_por,
          routine_templates (nombre),
          pdv (nombre),
          profiles:completado_por (nombre, apellido)
        `)
        // Filtro de fecha inclusivo
        .gte('fecha_programada', dateFrom)
        .lte('fecha_programada', dateTo);

      // --- LOGICA DE FILTRADO POR ROL ---
      // FIX: Administrador ahora ve todo el tenant (Organizacional) a menos que filtre.
      // Se eliminó la restricción que forzaba a ver solo "mis tareas".
      
      // Aplicar filtros explícitos si existen
      if (selectedPdvs.length > 0) query = query.in('pdv_id', selectedPdvs);
      if (selectedRoutines.length > 0) query = query.in('rutina_id', selectedRoutines);
      if (selectedUsers.length > 0) query = query.in('completado_por', selectedUsers);

      const { data, error } = await query;
      
      if (error) {
        console.error("Dashboard query error:", error);
        throw error;
      }

      console.log("Dashboard raw result:", data?.length, "records found.");
      return data || [];
    }
  });

  // --- PROCESAMIENTO DE DATOS (useMemo para optimizar) ---
  const processedData = useMemo(() => {
    // 1. Stats
    const total = tasks.length;
    const completed = tasks.filter(t => t.estado.startsWith('completada')).length;
    const pending = tasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso').length;
    const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;
    const critical = tasks.filter(t => t.prioridad_snapshot === 'critica' || t.audit_status === 'rechazado').length;
    
    const stats: DashboardStats = { totalTasks: total, completedTasks: completed, pendingTasks: pending, compliance, criticalAlerts: critical };

    // 2. Trends
    const groupedByDate = tasks.reduce((acc: any, curr) => {
      const d = curr.fecha_programada;
      if (!acc[d]) acc[d] = { date: d, Total: 0, completed: 0, pending: 0 };
      acc[d].Total++;
      if (curr.estado.startsWith('completada')) acc[d].completed++;
      if (curr.estado === 'pendiente') acc[d].pending++;
      return acc;
    }, {});
    
    const trendData = Object.values(groupedByDate).sort((a:any, b:any) => a.date.localeCompare(b.date)).map((i:any) => ({
      ...i, name: format(parseLocalDate(i.date), 'dd MMM', { locale: es })
    }));

    // 3. Alerts
    const alertsMap = tasks.reduce((acc: any, curr) => {
      if (curr.prioridad_snapshot === 'critica' || curr.audit_status === 'rechazado' || curr.estado === 'incumplida') {
        const d = curr.fecha_programada;
        if (!acc[d]) acc[d] = { date: d, count: 0 };
        acc[d].count++;
      }
      return acc;
    }, {});
    const alertsData = Object.values(alertsMap).sort((a:any, b:any) => a.date.localeCompare(b.date)).map((i:any) => ({
      name: format(parseLocalDate(i.date), 'dd MMM', { locale: es }),
      Alertas: i.count
    }));

    // 4. Status (Pie)
    const statusCounts = { 'a_tiempo': 0, 'vencida': 0, 'pendiente': 0, 'incumplida': 0 };
    tasks.forEach(t => {
      if (t.estado === 'completada_a_tiempo') statusCounts.a_tiempo++;
      else if (t.estado === 'completada_vencida') statusCounts.vencida++;
      else if (t.estado === 'incumplida') statusCounts.incumplida++;
      else statusCounts.pendiente++;
    });
    const statusData = [
      { name: 'A Tiempo', value: statusCounts.a_tiempo, color: COLORS.a_tiempo },
      { name: 'Vencida', value: statusCounts.vencida, color: COLORS.vencida },
      { name: 'Pendiente', value: statusCounts.pendiente, color: COLORS.pendiente },
      { name: 'Incumplida', value: statusCounts.incumplida, color: COLORS.incumplida },
    ].filter(i => i.value > 0);

    // 5. Routines
    const routineMap = tasks.reduce((acc: any, curr) => {
      const name = curr.routine_templates?.nombre || 'Desconocida';
      if (!acc[name]) acc[name] = { name, cumples: 0, fallas: 0 };
      if (curr.estado.startsWith('completada')) acc[name].cumples++;
      else acc[name].fallas++;
      return acc;
    }, {});
    const routineData = Object.values(routineMap).sort((a:any, b:any) => b.fallas - a.fallas).slice(0, 8) as ChartDataPoint[];

    // 6. Performance
    const userMap = tasks.reduce((acc: any, curr) => {
      if (!curr.profiles) return acc;
      const name = `${curr.profiles.nombre} ${curr.profiles.apellido}`;
      if (!acc[name]) acc[name] = { name, total: 0, completed: 0 };
      acc[name].total++;
      if (curr.estado.startsWith('completada')) acc[name].completed++;
      return acc;
    }, {});
    const performanceData = Object.values(userMap)
      .map((u:any) => ({ ...u, percentage: Math.round((u.completed / u.total) * 100) }))
      .sort((a:any, b:any) => b.percentage - a.percentage)
      .slice(0, 10);

    // 7. Recent
    const recentActivity = [...tasks].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6);

    return {
      stats, trendData, alertsData, statusData, routineData, performanceData, recentActivity
    };
  }, [tasks]);

  const clearFilters = () => {
    const today = getLocalDate();
    setDateFrom(today); setDateTo(today);
    setSelectedPdvs([]); setSelectedRoutines([]); setSelectedUsers([]);
  };

  return {
    loading,
    ...processedData,
    filters: {
      dateFrom, setDateFrom,
      dateTo, setDateTo,
      selectedPdvs, setSelectedPdvs,
      selectedRoutines, setSelectedRoutines,
      selectedUsers, setSelectedUsers,
      clearFilters,
      fetchData: refetch // Conectamos el botón actualizar al refetch de React Query
    },
    options: filterOptions,
    profile
  };
};