import { useState, useEffect } from "react";
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

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Options
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ pdvs: [], routines: [], users: [] });

  // Data States
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({ totalTasks: 0, completedTasks: 0, pendingTasks: 0, compliance: 0, criticalAlerts: 0 });
  
  const [trendData, setTrendData] = useState<ChartDataPoint[]>([]);
  const [alertsData, setAlertsData] = useState<ChartDataPoint[]>([]);
  const [statusData, setStatusData] = useState<StatusDataPoint[]>([]);
  const [routineData, setRoutineData] = useState<ChartDataPoint[]>([]);
  const [performanceData, setPerformanceData] = useState<UserPerformance[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Init Date
  useEffect(() => {
    const today = getLocalDate();
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // Load Filter Options
  useEffect(() => {
    const loadOptions = async () => {
      const { data: pdvData } = await supabase.from('pdv').select('id, nombre').eq('activo', true).order('nombre');
      const { data: routData } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true).order('nombre');
      
      let userData: any[] = [];
      if (profile?.role !== 'administrador') {
        const { data } = await supabase.from('profiles').select('id, nombre, apellido').eq('activo', true).order('nombre');
        userData = data || [];
      }

      setFilterOptions({
        pdvs: pdvData?.map(p => ({ label: p.nombre, value: p.id })) || [],
        routines: routData?.map(r => ({ label: r.nombre, value: r.id })) || [],
        users: userData?.map(u => ({ label: `${u.nombre} ${u.apellido}`, value: u.id })) || []
      });
    };
    if (profile) loadOptions();
  }, [profile]);

  // Fetch Data
  const fetchData = async () => {
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

    processData(tasks);
    setLoading(false);
  };

  const processData = (tasks: any[]) => {
    // 1. Stats
    const total = tasks.length;
    const completed = tasks.filter(t => t.estado.startsWith('completada')).length;
    const pending = tasks.filter(t => t.estado === 'pendiente' || t.estado === 'en_proceso').length;
    const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;
    const critical = tasks.filter(t => t.prioridad_snapshot === 'critica' || t.audit_status === 'rechazado').length;
    
    setStats({ totalTasks: total, completedTasks: completed, pendingTasks: pending, compliance, criticalAlerts: critical });

    // 2. Trends
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

    // 3. Alerts
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

    // 4. Status (Pie)
    const statusCounts = { 'a_tiempo': 0, 'vencida': 0, 'pendiente': 0, 'incumplida': 0 };
    tasks.forEach(t => {
      if (t.estado === 'completada_a_tiempo') statusCounts.a_tiempo++;
      else if (t.estado === 'completada_vencida') statusCounts.vencida++;
      else if (t.estado === 'incumplida') statusCounts.incumplida++;
      else statusCounts.pendiente++;
    });
    setStatusData([
      { name: 'A Tiempo', value: statusCounts.a_tiempo, color: COLORS.a_tiempo },
      { name: 'Vencida', value: statusCounts.vencida, color: COLORS.vencida },
      { name: 'Pendiente', value: statusCounts.pendiente, color: COLORS.pendiente },
      { name: 'Incumplida', value: statusCounts.incumplida, color: COLORS.incumplida },
    ].filter(i => i.value > 0));

    // 5. Routines
    const routineMap = tasks.reduce((acc: any, curr) => {
      const name = curr.routine_templates?.nombre || 'Desconocida';
      if (!acc[name]) acc[name] = { name, cumples: 0, fallas: 0 };
      if (curr.estado.startsWith('completada')) acc[name].cumples++;
      else acc[name].fallas++;
      return acc;
    }, {});
    
    // Fix: Explicitly cast to ChartDataPoint[] to resolve type error
    setRoutineData(Object.values(routineMap).sort((a:any, b:any) => b.fallas - a.fallas).slice(0, 8) as ChartDataPoint[]);

    // 6. Performance
    const userMap = tasks.reduce((acc: any, curr) => {
      if (!curr.profiles) return acc;
      const name = `${curr.profiles.nombre} ${curr.profiles.apellido}`;
      if (!acc[name]) acc[name] = { name, total: 0, completed: 0 };
      acc[name].total++;
      if (curr.estado.startsWith('completada')) acc[name].completed++;
      return acc;
    }, {});
    setPerformanceData(Object.values(userMap)
      .map((u:any) => ({ ...u, percentage: Math.round((u.completed / u.total) * 100) }))
      .sort((a:any, b:any) => b.percentage - a.percentage)
      .slice(0, 10));

    // 7. Recent
    setRecentActivity([...tasks].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6));
  };

  useEffect(() => { fetchData(); }, [dateFrom, dateTo, selectedPdvs, selectedRoutines, selectedUsers, profile]);

  const clearFilters = () => {
    const today = getLocalDate();
    setDateFrom(today); setDateTo(today);
    setSelectedPdvs([]); setSelectedRoutines([]); setSelectedUsers([]);
  };

  return {
    loading,
    stats,
    trendData,
    alertsData,
    statusData,
    routineData,
    performanceData,
    recentActivity,
    filters: {
      dateFrom, setDateFrom,
      dateTo, setDateTo,
      selectedPdvs, setSelectedPdvs,
      selectedRoutines, setSelectedRoutines,
      selectedUsers, setSelectedUsers,
      clearFilters,
      fetchData
    },
    options: filterOptions,
    profile
  };
};