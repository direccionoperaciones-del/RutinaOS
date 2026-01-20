import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useCurrentUser() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchUserContext() {
      try {
        // 1. Obtener Sesión
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;
        
        if (!session?.user) {
          if (mounted) setLoading(false);
          return;
        }

        const userId = session.user.id;
        if (mounted) setUser(session.user);

        // 2. Intentar obtener Perfil y Tenant de la DB
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*, tenants(*)')
          .eq('id', userId)
          .maybeSingle(); // Usamos maybeSingle para no lanzar error si no existe

        if (profileError) {
          console.error("Error fetching profile:", profileError);
          throw profileError;
        }

        if (profileData) {
          // CASO ÉXITO: Tenemos perfil y tenant
          if (mounted) {
            setProfile(profileData);
            setTenantId(profileData.tenant_id);
          }
        } else {
          // CASO FALLO SILENCIOSO: El usuario está en Auth pero no en DB (Race condition o error trigger)
          console.warn("Usuario sin perfil en DB. Intentando usar Default Tenant...");
          // Fallback temporal si el script SQL ya corrió pero algo falló en la query
          // O podríamos forzar logout aquí si es estricto.
          setError("Perfil de usuario no encontrado. Contacte soporte.");
        }

      } catch (err: any) {
        console.error("Fatal User Context Error:", err);
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchUserContext();

    // Listener para cambios en Auth (logout/login)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        fetchUserContext();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setTenantId(null);
      }
    });

    return () => { 
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Helper para saber si estamos listos para operar
  const isReady = !loading && !!tenantId;

  return { 
    user, 
    profile, 
    tenantId, 
    loading, 
    error,
    isReady 
  };
}