import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Building2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export function TenantSwitcher() {
  const { isSuperAdmin, tenantId, impersonateTenant } = useCurrentUser();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      const fetchTenants = async () => {
        setLoading(true);
        // Gracias a la política RLS 'superadmin_all_tenants', podemos verlos todos
        const { data } = await supabase
          .from('tenants')
          .select('id, nombre, codigo, activo')
          .order('nombre');
        
        if (data) setTenants(data);
        setLoading(false);
      };
      fetchTenants();
    }
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;

  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1 rounded-md mx-2 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-1 text-red-700 font-bold text-xs uppercase tracking-wider">
        <ShieldAlert className="w-3 h-3" />
        GOD MODE
      </div>
      
      <div className="h-4 w-px bg-red-200 mx-1" />
      
      <div className="flex items-center gap-2">
        <Building2 className="w-3 h-3 text-red-600" />
        <Select 
          value={tenantId || ""} 
          onValueChange={(val) => impersonateTenant(val)}
          disabled={loading}
        >
          <SelectTrigger className="h-7 w-[200px] text-xs bg-white border-red-200 focus:ring-red-500 text-red-900">
            <SelectValue placeholder="Seleccionar Empresa" />
          </SelectTrigger>
          <SelectContent>
            {tenants.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.nombre} {t.codigo === 'GOD-MODE' ? '(Admin)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}