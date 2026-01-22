import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

export function useMyTasks(dateFrom: string, dateTo: string) {
  const { user, profile } = useCurrentUser();

  return useQuery({
    queryKey: ['my-tasks', user?.id, dateFrom, dateTo],
    enabled: !!user && !!profile,
    queryFn: async () => {
      if (!user) throw new Error("No autenticado");

      // Construcción de la consulta
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
        `);

      // Lógica de Filtro:
      // 1. Tareas programadas en el rango de fechas
      // 2. O tareas pendientes antiguas (Backlog)
      
      // Combinamos: (Rango Fechas) OR (Pendientes)
      // Para que el usuario vea lo que tiene que hacer HOY (pendiente) + lo que hizo HOY.
      query = query.or(`fecha_programada.eq.${dateTo},estado.in.(pendiente,en_proceso)`);
      
      // --- RESTRICCIÓN DE SEGURIDAD PARA ADMINISTRADOR ---
      if (profile?.role === 'administrador') {
        // 1. Obtener mis PDVs activos
        const { data: assignments } = await supabase
          .from('pdv_assignments')
          .select('pdv_id')
          .eq('user_id', user.id)
          .eq('vigente', true);
        
        const myPdvIds = assignments?.map(a => a.pdv_id) || [];
        
        if (myPdvIds.length > 0) {
          // Filtrar por mis PDVs asignados O tareas que yo completé (histórico personal)
          query = query.or(`pdv_id.in.(${myPdvIds.join(',')}),completado_por.eq.${user.id}`);
        } else {
          // Si no tengo PDV, solo lo que yo haya tocado
          query = query.eq('completado_por', user.id);
        }
      }
      
      const { data, error } = await query
        .order('prioridad_snapshot', { ascending: false }) // Críticas primero
        .order('fecha_programada', { ascending: true });   // Más antiguas primero

      if (error) {
        console.error("Error fetching tasks:", error);
        throw error;
      }

      // Filtrado adicional en memoria para asegurar rango de fechas en las completadas
      // (Ya que el OR trajo pendientes de cualquier fecha, pero queremos completadas solo del rango)
      const filteredData = (data || []).filter((task: any) => {
        if (task.estado === 'pendiente' || task.estado === 'en_proceso') return true;
        // Si está completada, debe estar en el rango seleccionado
        return task.fecha_programada >= dateFrom && task.fecha_programada <= dateTo;
      });

      return filteredData;
    }
  });
}