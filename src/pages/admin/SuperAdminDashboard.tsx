import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Building2, Users, CheckCircle2, XCircle, Search, LogIn, ArrowRight } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { format } from "date-fns";

export default function SuperAdminDashboard() {
  const { impersonateTenant } = useCurrentUser();
  const [tenants, setTenants] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalOrgs: 0, totalUsers: 0, activeOrgs: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Fetch Tenants con conteo de usuarios (aprox)
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    // 2. Fetch Users global count
    const { count: userCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (tenantData) {
      setTenants(tenantData);
      setStats({
        totalOrgs: tenantData.length,
        activeOrgs: tenantData.filter(t => t.activo).length,
        totalUsers: userCount || 0
      });
    }
    setLoading(false);
  };

  const filteredTenants = tenants.filter(t => 
    t.nombre.toLowerCase().includes(search.toLowerCase()) || 
    t.codigo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-red-700 flex items-center gap-2">
          <Building2 className="w-8 h-8" /> Panel Superadmin
        </h2>
        <p className="text-muted-foreground">Control total de la plataforma.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-red-100 bg-red-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-800">Organizaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-900">{stats.totalOrgs}</div>
            <p className="text-xs text-red-600 mt-1">{stats.activeOrgs} activas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Usuarios Totales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">En toda la plataforma</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Listado de Empresas</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar empresa..." 
                className="pl-8" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creada</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : filteredTenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      {t.logo_url && <img src={t.logo_url} className="w-6 h-6 rounded object-contain bg-white border" />}
                      {t.nombre}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.codigo}</TableCell>
                  <TableCell>
                    {t.activo ? 
                      <Badge className="bg-green-100 text-green-700 border-green-200">Activa</Badge> : 
                      <Badge variant="secondary">Inactiva</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(t.created_at), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-red-700 border-red-200 hover:bg-red-50"
                      onClick={() => impersonateTenant(t.id)}
                    >
                      <LogIn className="w-3 h-3 mr-2" /> Acceder
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}