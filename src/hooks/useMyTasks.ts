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

      // Base query
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
        `)
        .gte('fecha_programada', dateFrom)
        .lte('fecha_programada', dateTo);

      // Admin filter logic: Show tasks for my PDVs OR tasks I completed
      if (profile?.role === 'administrador') {
        // 1. Get my active PDVs
        const { data: assignments } = await supabase
          .from('pdv_assignments')
          .select('pdv_id')
          .eq('user_id', user.id)
          .eq('vigente', true);
        
        const myPdvIds = assignments?.map(a => a.pdv_id) || [];
        
        if (myPdvIds.length > 0) {
          // Filter by PDV list OR completed_by me
          // Syntax: pdv_id.in.(ids),completado_por.eq.id
          query = query.or(`pdv_id.in.(${myPdvIds.join(',')}),completado_por.eq.${user.id}`);
        } else {
          // If no PDV assigned, only show what I completed
          query = query.eq('completado_por', user.id);
        }
      }
      
      const { data, error } = await query
        .order('prioridad_snapshot', { ascending: false })
        .order('hora_limite_snapshot', { ascending: true });

      if (error) {
        console.error("Error fetching tasks:", error);
        throw error;
      }

      return data || [];
    }
  });
}