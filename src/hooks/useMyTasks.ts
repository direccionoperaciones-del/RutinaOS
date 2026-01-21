import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMyTasks = () => {
  return useQuery({
    queryKey: ["my-tasks"],
    queryFn: async () => {
      // 1. Obtener usuario autenticado
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      // 2. Query a la tabla correcta 'task_instances'
      // Se asume que existen relaciones configuradas en BD para 'routine' y 'pdv'
      // Si no, eliminar los joins routine:routine_id(...) y pdv:pdv_id(...)
      const { data, error } = await supabase
        .from("task_instances")
        .select(`
          *,
          routine:routine_id (id, nombre, descripcion),
          pdv:pdv_id (id, nombre)
        `)
        .eq("assigned_user_id", user.id)
        .order("scheduled_date", { ascending: true });

      if (error) {
        console.error("Error fetching tasks:", error);
        throw new Error(error.message);
      }

      return data || [];
    },
    retry: 1, // No reintentar infinitamente si es un 400/404
  });
};