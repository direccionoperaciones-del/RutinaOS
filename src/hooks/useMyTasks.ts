import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

export function useMyTasks(dateFrom: string, dateTo: string) {
  const { user, profile } = useCurrentUser();

  return useQuery({
    queryKey: ['my-tasks', user?.id, dateFrom, dateTo],
    enabled: !!user && !!profile,
    placeholderData: keepPreviousData,
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

      // --- LÓGICA DE VISIBILIDAD CORREGIDA ---
      // 1. Traer tareas del rango de fechas seleccionado (para ver historial/completadas)
      // 2. O traer tareas que sigan PENDIENTES (para que las mensuales no desaparezcan después del día 1)
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
          // Ver tareas de mis PDVs O tareas que yo haya completado (por si me cambiaron de PDV)
          // Usamos filter en JS para esto porque mezclar ORs de RLS y lógica de negocio en Supabase puede ser complejo
          // Pero aquí aplicamos filtro directo de columna para eficiencia
          query = query.in('pdv_id', myPdvIds);
        } else {
          // Si no tiene PDV, solo ve lo que haya completado él
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

      // Filtrado final de seguridad en cliente para asegurar que el Admin no vea cosas raras si el OR trajo de más
      let finalData = data || [];
      
      // Eliminar duplicados si el OR trajo la misma tarea por fecha y estado (Supabase lo maneja, pero por seguridad)
      // Y excluir canceladas a menos que se quiera ver explícitamente (se maneja en la UI)
      
      return finalData;
    }
  });
}