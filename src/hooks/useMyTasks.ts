import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

export function useMyTasks(dateFrom: string, dateTo: string) {
  const { user, profile, tenantId } = useCurrentUser();

  // Validar que las fechas existan antes de habilitar la query
  const isEnabled = !!user && !!profile && !!dateFrom && !!dateTo && !!tenantId;

  return useQuery({
    queryKey: ['my-tasks', user?.id, tenantId, dateFrom, dateTo], // Añadido tenantId a la key para refrescar al cambiar
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!user || !tenantId) throw new Error("No autenticado o sin tenant");

      let query = supabase
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
        .eq('tenant_id', tenantId); // <--- FILTRO EXPLÍCITO

      // --- LÓGICA DE VISIBILIDAD CORREGIDA ---
      // 1. Traer tareas del rango de fechas seleccionado (Histórico)
      // 2. O traer tareas PENDIENTES o EN PROCESO (Vigentes de días anteriores)
      const rangeCondition = `and(fecha_programada.gte.${dateFrom},fecha_programada.lte.${dateTo})`;
      const pendingCondition = `estado.eq.pendiente`;
      const processCondition = `estado.eq.en_proceso`;
      
      // Aplicamos filtro OR: (En Rango) O (Pendiente) O (En Proceso)
      query = query.or(`${rangeCondition},${pendingCondition},${processCondition}`);
      
      // --- RESTRICCIÓN DE SEGURIDAD (Tenant & Role) ---
      if (profile?.role === 'administrador') {
        const { data: assignments } = await supabase
          .from('pdv_assignments')
          .select('pdv_id')
          .eq('user_id', user.id)
          .eq('vigente', true);
        
        const myPdvIds = assignments?.map(a => a.pdv_id) || [];
        
        if (myPdvIds.length > 0) {
          // Ver tareas de mis PDVs asignados
          query = query.in('pdv_id', myPdvIds);
        } else {
          // Si no tiene PDV, solo ve lo que haya completado él (histórico personal)
          query = query.eq('completado_por', user.id);
        }
      }
      
      // Ordenar: Primero las críticas/altas, luego por fecha
      const { data, error } = await query
        .order('fecha_programada', { ascending: true }) 
        .order('prioridad_snapshot', { ascending: false });

      if (error) {
        console.error("Error fetching tasks:", error);
        throw error;
      }

      return data || [];
    }
  });
}