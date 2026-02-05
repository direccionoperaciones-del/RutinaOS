import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useCurrentUser() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          if (mounted) setLoading(false);
          return;
        }

        if (mounted) setUser(session.user);

        // Fetch Profile & Tenant info
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*, tenants(*)')
          .eq('id', session.user.id)
          .single();

        if (profileError) throw profileError;

        if (mounted) {
          setProfile(profileData);
          
          const isSuper = profileData.role === 'superadmin';
          setIsSuperAdmin(isSuper);

          if (isSuper) {
            // Lógica de Superadmin: Recuperar tenant impersonado del storage o usar el propio
            const impersonated = localStorage.getItem('superadmin_impersonated_tenant_id');
            if (impersonated) {
              setTenantId(impersonated);
            } else {
              setTenantId(profileData.tenant_id);
            }
          } else {
            // Usuario Normal: Su tenant real
            setTenantId(profileData.tenant_id);
          }
        }
      } catch (err: any) {
        console.error("Error fetching user context:", err);
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchUser();

    return () => { mounted = false; };
  }, []);

  // Función para cambiar de organización (Solo Superadmin)
  const impersonateTenant = (newTenantId: string | null) => {
    if (!isSuperAdmin) return;
    
    if (newTenantId) {
      localStorage.setItem('superadmin_impersonated_tenant_id', newTenantId);
      setTenantId(newTenantId);
    } else {
      localStorage.removeItem('superadmin_impersonated_tenant_id');
      setTenantId(profile?.tenant_id);
    }
    // Recargar para refrescar todas las queries con el nuevo tenant_id
    window.location.reload();
  };

  return { user, profile, tenantId, loading, error, isSuperAdmin, impersonateTenant };
}