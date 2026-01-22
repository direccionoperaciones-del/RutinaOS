import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { addDays, format, subDays } from "date-fns";

export function useMyTasks(dateFrom: string, dateTo: string) {
  const { user, profile } = useCurrentUser();

  return useQuery({
    queryKey: ['my-tasks', user?.id, dateFrom, dateTo],
    enabled: !!user && !!profile,
    queryFn: async () => {
      if (!user) throw new Error("No autenticado");

      // Calcular fecha de corte para traer historial reciente (cubrir mes actual + margen)
      // Esto permite traer la tarea generada el día 1 aunque hoy sea 25.
      const searchStart = format(subDays(new Date(dateFrom), 45), 'yyyy-MM-dd');

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

      // ESTRATEGIA DE CARGA:
      // 1. Traer TODAS las pendientes (Backlog histórico completo)
      // 2. Traer tareas recientes (desde hace 45 días) para cubrir el ciclo mensual actual
      query = query.or(`estado.in.(pendiente,en_proceso),fecha_programada.gte.${searchStart}`);
      
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

      // FILTRADO EN MEMORIA (Lógica de Visualización "Mis Tareas")
      const filteredData = (data || []).filter((task: any) => {
        // 1. Tareas Pendientes: Mostrar SIEMPRE (Backlog)
        if (task.estado === 'pendiente' || task.estado === 'en_proceso') {
          return true;
        }

        // 2. Tareas Completadas/Vencidas: Mostrar si son relevantes para el rango seleccionado
        
        // A. Programadas en el rango (Ej: Tarea diaria de hoy)
        const scheduledInRange = task.fecha_programada >= dateFrom && task.fecha_programada <= dateTo;
        
        // B. Completadas en el rango (Ej: Tarea mensual del día 1, completada hoy día 22)
        let completedInRange = false;
        if (task.completado_at) {
          const completedDate = task.completado_at.split('T')[0]; // YYYY-MM-DD
          completedInRange = completedDate >= dateFrom && completedDate <= dateTo;
        }

        return scheduledInRange || completedInRange;
      });

      return filteredData;
    }
  });
}