import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ID Fijo para modo Single-Tenant (debe coincidir con el SQL)
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export function useCurrentUser() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  
  // Inicializamos directamente con el default para que la UI no parpadee error
  const [tenantId, setTenantId] = useState<string>(DEFAULT_TENANT_ID);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function resolveTenantAndUser() {
      try {
        // 1. Obtener Sesión Auth
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;
        
        if (!session?.user) {
          if (mounted) setLoading(false);
          return;
        }

        if (mounted) setUser(session.user);

        // 2. Intentar obtener datos reales de DB
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*, tenants(*)')
          .eq('id', session.user.id)
          .maybeSingle();

        if (mounted) {
          if (profileData) {
            setProfile(profileData);
            // Si la DB tiene tenant, úsalo. Si no, mantén el default.
            if (profileData.tenant_id) {
              setTenantId(profileData.tenant_id);
            }
          } else {
            console.warn("Modo Single-Tenant: Usuario sin perfil en DB, usando Default.");
            // Aquí podríamos crear el perfil on-the-fly si quisiéramos ser más agresivos
          }
        }

      } catch (err: any) {
        console.error("Error en user context:", err);
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    resolveTenantAndUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        resolveTenantAndUser();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        // No reseteamos tenantId a null para evitar crash en pantallas públicas si las hubiera
      }
    });

    return () => { 
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Siempre retornamos isReady true si tenemos el default, para no bloquear la UI
  const isReady = !loading;

  return { 
    user, 
    profile, 
    tenantId, // Ahora nunca es null
    loading, 
    error,
    isReady 
  };
}