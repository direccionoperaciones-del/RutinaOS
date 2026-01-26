import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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

  // --- FILTROS ---
  const [dateFrom, setDateFrom] = useState(getLocalDate());
  const [dateTo, setDateTo] = useState(getLocalDate());
  const [selectedPdvs, setSelectedPdvs] = useState<string[]>([]);
  const [selectedRoutines, setSelectedRoutines] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // --- OPCIONES DE FILTRO ---
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ pdvs: [], routines: [], users: [] });

  // 1. Cargar Opciones (PDVs, Rutinas, Usuarios)
  useQuery({
    queryKey: ['dashboard-options', user?.id],
    enabled: !!user && !!profile,
    queryFn: async () => {
      // 1. PDVs
      let pdvData: any[] = [];
      if (profile?.role === 'administrador') {
        const { data: assignments } = await supabase
          .from('pdv_assignments')
          .select('pdv (id, nombre)')
          .eq('user_id', user?.id)
          .eq('vigente', true);
        pdvData = assignments?.map((a: any) => a.pdv).filter(Boolean) || [];
      } else {
        const { data } = await supabase.from('pdv').select('id, nombre').eq('activo', true).order('nombre');
        pdvData = data || [];
      }

      // 2. Rutinas
      const { data: routines } = await supabase.from('routine_templates').select('id, nombre').eq('activo', true).order('nombre');
      
      // 3. Usuarios (Solo si no es admin)
      let userData: any[] = [];
      if (profile?.role !== 'administrador') {
        const { data } = await supabase.from('profiles').select('id, nombre, apellido').eq('activo', true).order('nombre');
        userData = data || [];
      }

      setFilterOptions({
        pdvs: pdvData.map(p => ({ label: p.nombre, value: p.id })),
        routines: routines?.map(r => ({ label: r.nombre, value: r.id })) || [],
        users: userData?.map(u => ({ label: `${u.nombre} ${u.apellido}`, value: u.id })) || []
      });
      return true;
    }
  });

  // 2. QUERY PRINCIPAL (DASHBOARD DATA)
  const { data: tasks = [], isLoading: loading, refetch, isRefetching } = useQuery({
    // La queryKey incluye TODOS los filtros para auto-refetch al cambiar
    queryKey: ['dashboard-data', profile?.tenant_id, dateFrom, dateTo, selectedPdvs, selectedRoutines, selectedUsers],
    enabled: !!profile && !!user && !!dateFrom && !!dateTo,
    queryFn: async () => {
      console.log("[Dashboard] queryFn ejecutado", { 
        filters: { dateFrom, dateTo, selectedPdvs, selectedRoutines, selectedUsers },
        role: profile?.role, 
        tenantId: profile?.tenant_id,
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
        .eq('tenant_id', profile?.tenant_id) // Filtro Tenant Obligatorio
        .gte('fecha_programada', dateFrom)
        .lte('fecha_programada', dateTo);

      // --- LOGICA DE ROL ---
      if (profile?.role === 'administrador') {
        // ADMIN: Ver tareas de sus PDVs asignados
        const { data: assignments } = await supabase
          .from('pdv_assignments')
          .select('pdv_id')
          .eq('user_id', user?.id)
          .eq('vigente', true);
        
        const myPdvIds = assignments?.map((a: any) => a.pdv_id) || [];
        console.log("[Dashboard] Admin assigned PDVs:", myPdvIds);

        if (myPdvIds.length > 0) {
          // Si seleccionó filtros de PDV, interceptarlos con los asignados por seguridad
          const targetIds = selectedPdvs.length > 0 
            ? selectedPdvs.filter(id => myPdvIds.includes(id))
            : myPdvIds;
          
          if (targetIds.length > 0) {
            query = query.in('pdv_id', targetIds);
          } else {
            // Seleccionó un PDV que no es suyo -> 0 resultados
            query = query.in('pdv_id', ['00000000-0000-0000-0000-000000000000']);
          }
        } else {
          // Si no tiene asignaciones, ver solo lo completado por él (histórico)
          query = query.eq('completado_por', user?.id);
        }
      } else {
        // DIRECTOR / LIDER / AUDITOR
        if (selectedPdvs.length > 0) query = query.in('pdv_id', selectedPdvs);
        if (selectedUsers.length > 0) query = query.in('completado_por', selectedUsers);
      }

      // Filtros comunes
      if (selectedRoutines.length > 0) query = query.in('rutina_id', selectedRoutines);

      const { data, error } = await query;
      
      if (error) {
        console.error("[Dashboard] Error Supabase:", error);
        throw error;
      }

      console.log("[Dashboard] raw result:", data?.length, "records");
      return data || [];
    }
  });

  // 3. Procesamiento de Datos (Memoizado)
  const processedData = useMemo(() => {
    // Stats Base
    const total = tasks.length;
    const completed = tasks.filter((t: any) => t.estado.startsWith('completada')).length;
    const pending = tasks.filter((t: any) => t.estado === 'pendiente' || t.estado === 'en_proceso').length;
    const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;
    const critical = tasks.filter((t: any) => t.prioridad_snapshot === 'critica' || t.audit_status === 'rechazado').length;
    
    const stats: DashboardStats = { totalTasks: total, completedTasks: completed, pendingTasks: pending, compliance, criticalAlerts: critical };

    // Trends
    const groupedByDate = tasks.reduce((acc: any, curr: any) => {
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

    // Alerts
    const alertsMap = tasks.reduce((acc: any, curr: any) => {
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

    // Status
    const statusCounts = { 'a_tiempo': 0, 'vencida': 0, 'pendiente': 0, 'incumplida': 0 };
    tasks.forEach((t: any) => {
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

    // Routines
    const routineMap = tasks.reduce((acc: any, curr: any) => {
      const name = curr.routine_templates?.nombre || 'Desconocida';
      if (!acc[name]) acc[name] = { name, cumples: 0, fallas: 0 };
      if (curr.estado.startsWith('completada')) acc[name].cumples++;
      else acc[name].fallas++;
      return acc;
    }, {});
    const routineData = Object.values(routineMap).sort((a:any, b:any) => b.fallas - a.fallas).slice(0, 8) as ChartDataPoint[];

    // Performance
    const userMap = tasks.reduce((acc: any, curr: any) => {
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

    // Recent
    const recentActivity = [...tasks].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6);

    console.log("[Dashboard] computed stats:", stats);

    return { stats, trendData, alertsData, statusData, routineData, performanceData, recentActivity };
  }, [tasks]);

  const clearFilters = () => {
    const today = getLocalDate();
    setDateFrom(today); setDateTo(today);
    setSelectedPdvs([]); setSelectedRoutines([]); setSelectedUsers([]);
  };

  const handleManualRefresh = () => {
    console.log("[Dashboard] click Actualizar");
    refetch();
  };

  return {
    loading: loading || isRefetching,
    ...processedData,
    filters: {
      dateFrom, setDateFrom,
      dateTo, setDateTo,
      selectedPdvs, setSelectedPdvs,
      selectedRoutines, setSelectedRoutines,
      selectedUsers, setSelectedUsers,
      clearFilters,
      fetchData: handleManualRefresh
    },
    options: filterOptions,
    profile
  };
};