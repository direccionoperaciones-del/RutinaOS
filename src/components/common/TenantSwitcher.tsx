import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <div className="flex items-center gap-1 sm:gap-2 bg-red-50 border border-red-200 px-2 sm:px-3 py-1 rounded-md mx-1 sm:mx-2 animate-in fade-in slide-in-from-top-2 max-w-[140px] sm:max-w-none">
      <div className="flex items-center gap-1 text-red-700 font-bold text-[10px] sm:text-xs uppercase tracking-wider shrink-0">
        <ShieldAlert className="w-3 h-3 sm:w-4 sm:h-4" />
        <span className="hidden sm:inline">GOD MODE</span>
      </div>
      
      <div className="h-3 sm:h-4 w-px bg-red-200 mx-1 hidden sm:block" />
      
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
        <Building2 className="w-3 h-3 text-red-600 hidden sm:block" />
        <Select 
          value={tenantId || ""} 
          onValueChange={(val) => impersonateTenant(val)}
          disabled={loading}
        >
          <SelectTrigger className="h-6 sm:h-7 w-full min-w-[80px] sm:w-[200px] text-[10px] sm:text-xs bg-white border-red-200 focus:ring-red-500 text-red-900 px-1 sm:px-3">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            {tenants.map(t => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}