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

      // FILTRO DE FECHAS ESTRICTO:
      // Mostrar tarea SI:
      // 1. Su fecha programada está en el rango (fecha_programada >= from AND fecha_programada <= to)
      // 2. O SI se completó dentro del rango (completado_at >= from 00:00 AND completado_at <= to 23:59)
      
      const rangeFilter = `and(fecha_programada.gte.${dateFrom},fecha_programada.lte.${dateTo}),and(completado_at.gte.${dateFrom}T00:00:00,completado_at.lte.${dateTo}T23:59:59)`;
      
      query = query.or(rangeFilter);
      
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
          // Filtrar por mis PDVs asignados O tareas que yo completé
          query = query.or(`pdv_id.in.(${myPdvIds.join(',')}),completado_por.eq.${user.id}`);
        } else {
          query = query.eq('completado_por', user.id);
        }
      }
      
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