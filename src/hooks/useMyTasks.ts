import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMyTasks = () => {
  return useQuery({
    queryKey: ["my-tasks"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      // We don't filter by user_id here because RLS handles it based on PDV assignment
      const { data, error } = await supabase
        .from("task_instances")
        .select(`
          *,
          rutina:routine_templates (id, nombre, descripcion),
          pdv (id, nombre)
        `)
        .order("fecha_programada", { ascending: true })
        .order("hora_limite_snapshot", { ascending: true });

      if (error) {
        console.error("Error fetching tasks:", error);
        throw new Error(error.message);
      }

      return data || [];
    },
    retry: 1,
  });
};