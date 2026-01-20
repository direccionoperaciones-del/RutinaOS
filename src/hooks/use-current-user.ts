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
          setTenantId(profileData.tenant_id);
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

  return { user, profile, tenantId, loading, error };
}