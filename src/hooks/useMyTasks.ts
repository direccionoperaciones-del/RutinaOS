import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

export function useMyTasks(dateFrom: string, dateTo: string) {
  const { user, profile, tenantId } = useCurrentUser();

  // Validar que las fechas existan antes de habilitar la query
  const isEnabled = !!user && !!profile && !!dateFrom && !!dateTo && !!tenantId;

  return useQuery({
    queryKey: ['my-tasks', user?.id, tenantId, dateFrom, dateTo],
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!user || !tenantId) throw new Error("No autenticado o sin tenant");

      // 1. Preparar filtros de seguridad (Rol)
      let pdvIdsFilter: string[] | null = null;
      let userIdFilter: string | null = null;

      if (profile?.role === 'administrador') {
        const { data: assignments } = await supabase
          .from('pdv_assignments')
          .select('pdv_id')
          .eq('user_id', user.id)
          .eq('vigente', true);
        
        const ids = assignments?.map(a => a.pdv_id) || [];
        if (ids.length > 0) pdvIdsFilter = ids;
        else userIdFilter = user.id;
      }

      // Helper para aplicar filtros comunes
      const applyFilters = (query: any) => {
        if (pdvIdsFilter) return query.in('pdv_id', pdvIdsFilter);
        if (userIdFilter) return query.eq('completado_por', userIdFilter);
        return query;
      };

      // --- CONSULTA A: Rango de Fechas (Calendario Normal) ---
      // Trae TODAS las tareas (diarias, semanales, quincenales, mensuales) que caen en el rango seleccionado
      let queryRange = supabase
        .from('task_instances')
        .select(`
          *,
          routine_templates (
            id, nombre, descripcion, prioridad, frecuencia,
            gps_obligatorio, fotos_obligatorias, min_fotos,
            comentario_obligatorio, requiere_inventario,
            categorias_ids, archivo_obligatorio,
            enviar_email, responder_email,
            vencimiento_dia_mes, corte_1_limite, corte_2_limite
          ),
          pdv (id, nombre, ciudad, radio_gps, latitud, longitud),
          profiles:completado_por (id, nombre, apellido)
        `)
        .eq('tenant_id', tenantId)
        .gte('fecha_programada', dateFrom)
        .lte('fecha_programada', dateTo);

      queryRange = applyFilters(queryRange);

      // --- CONSULTA B: Backlog EXCLUSIVO MENSUAL ---
      // Trae tareas antiguas que siguen pendientes PERO SOLO si son MENSUALES.
      // (Diarias, Semanales y Quincenales antiguas NO se traen aquí, por lo tanto desaparecen si no se hicieron en su día)
      let queryBacklog = supabase
        .from('task_instances')
        .select(`
          *,
          routine_templates!inner (
            id, nombre, descripcion, prioridad, frecuencia,
            gps_obligatorio, fotos_obligatorias, min_fotos,
            comentario_obligatorio, requiere_inventario,
            categorias_ids, archivo_obligatorio,
            enviar_email, responder_email,
            vencimiento_dia_mes, corte_1_limite, corte_2_limite
          ),
          pdv (id, nombre, ciudad, radio_gps, latitud, longitud),
          profiles:completado_por (id, nombre, apellido)
        `)
        .eq('tenant_id', tenantId)
        .lt('fecha_programada', dateFrom) // Anteriores al rango actual
        .in('estado', ['pendiente', 'en_proceso']) // Que no se han cerrado
        .eq('routine_templates.frecuencia', 'mensual'); // ESTRICTAMENTE SOLO MENSUAL

      queryBacklog = applyFilters(queryBacklog);

      // Ejecutar en paralelo
      const [resRange, resBacklog] = await Promise.all([queryRange, queryBacklog]);

      if (resRange.error) throw resRange.error;
      if (resBacklog.error) throw resBacklog.error;

      // Unir resultados eliminando duplicados
      const allTasks = [...(resRange.data || []), ...(resBacklog.data || [])];
      
      // Map para unicidad por ID
      const uniqueMap = new Map();
      allTasks.forEach(t => uniqueMap.set(t.id, t));
      
      const combined = Array.from(uniqueMap.values());

      // Ordenar: Prioridad -> Fecha
      return combined.sort((a, b) => {
        const prioScore = (p: string) => {
          if (p === 'critica') return 4;
          if (p === 'alta') return 3;
          if (p === 'media') return 2;
          return 1;
        };
        
        const scoreA = prioScore(a.prioridad_snapshot);
        const scoreB = prioScore(b.prioridad_snapshot);
        
        if (scoreA !== scoreB) return scoreB - scoreA; // Mayor prioridad primero
        
        return new Date(a.fecha_programada).getTime() - new Date(b.fecha_programada).getTime(); // Más antiguas primero
      });
    }
  });
}