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
            enviar_email, responder_email
          ),
          pdv (id, nombre, ciudad, radio_gps, latitud, longitud),
          profiles:completado_por (id, nombre, apellido)
        `);

      // 1. Filtro base: Tareas de la fecha seleccionada O Tareas pendientes (Backlog)
      query = query.or(`fecha_programada.eq.${dateTo},estado.in.(pendiente,en_proceso)`);
      
      // 2. Filtros de Rol / Seguridad
      if (profile?.role === 'administrador') {
        // Buscar mis asignaciones explícitas
        const { data: assignments } = await supabase
          .from('pdv_assignments')
          .select('pdv_id')
          .eq('user_id', user.id)
          .eq('vigente', true);
        
        const myPdvIds = assignments?.map(a => a.pdv_id) || [];
        
        // CORRECCIÓN:
        // - Si tengo PDVs asignados -> Filtro por ellos.
        // - Si NO tengo asignaciones -> Veo TODO (comportamiento Super Admin/Dev).
        if (myPdvIds.length > 0) {
          query = query.or(`pdv_id.in.(${myPdvIds.join(',')}),completado_por.eq.${user.id}`);
        }
        // Si myPdvIds es vacío, no aplicamos filtro extra, confiamos en el filtro base.
        
      } else if (profile?.role !== 'administrador') {
        // Para otros roles (vendedores, etc), restringimos estrictamente
        // Esto depende de tus políticas RLS, pero por seguridad en frontend:
        query = query.eq('completado_por', user.id); // O lógica similar según tu modelo
      }
      
      const { data, error } = await query
        .order('prioridad_snapshot', { ascending: false })
        .order('fecha_programada', { ascending: true });

      if (error) {
        console.error("Error fetching tasks:", error);
        throw error;
      }

      // Filtrado final en memoria
      const filteredData = (data || []).filter((task: any) => {
        if (task.estado === 'pendiente' || task.estado === 'en_proceso') return true;
        return task.fecha_programada >= dateFrom && task.fecha_programada <= dateTo;
      });

      return filteredData;
    }
  });
}