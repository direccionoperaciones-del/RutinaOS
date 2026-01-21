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

      // Construcción de la consulta base CORRECTA a task_instances
      let query = supabase
        .from('task_instances') // ✅ Nombre de tabla corregido
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

      // Filtro específico para Administradores (ver solo lo propio)
      if (profile?.role === 'administrador') {
        // Lógica: Tareas donde soy el responsable O tareas que yo completé
        query = query.or(`responsable_id.eq.${user.id},completado_por.eq.${user.id}`);
      }
      
      // Ordenamiento por prioridad y hora
      const { data, error } = await query
        .order('prioridad_snapshot', { ascending: false }) // Critica primero
        .order('hora_limite_snapshot', { ascending: true }); // Las que vencen antes primero

      if (error) {
        console.error("Error fetching tasks:", error);
        throw error;
      }

      return data || [];
    }
  });
}