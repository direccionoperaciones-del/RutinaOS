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

      // --- FILTRO RADICAL Y ESTRICTO ---
      // Solo traemos tareas cuya fecha PROGRAMADA esté en el rango.
      // Eliminamos la condición "OR completado_at" que traía tareas de otros días.
      query = query
        .gte('fecha_programada', dateFrom)
        .lte('fecha_programada', dateTo);
      
      // --- RESTRICCIÓN DE SEGURIDAD ---
      if (profile?.role === 'administrador') {
        const { data: assignments } = await supabase
          .from('pdv_assignments')
          .select('pdv_id')
          .eq('user_id', user.id)
          .eq('vigente', true);
        
        const myPdvIds = assignments?.map(a => a.pdv_id) || [];
        
        if (myPdvIds.length > 0) {
          query = query.in('pdv_id', myPdvIds);
        } else {
          // Si no tiene PDV, solo ve lo que haya completado él (histórico)
          // pero respetando el filtro de fecha estricto de arriba
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