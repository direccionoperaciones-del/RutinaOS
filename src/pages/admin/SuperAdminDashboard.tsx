import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Building2, Users, CheckCircle2, XCircle, Search, LogIn, Calendar, Hash } from "lucide-react";
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
    
    // 1. Fetch Tenants
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
      {/* HEADER */}
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-red-700 flex items-center gap-2">
          <Building2 className="w-6 h-6 sm:w-8 sm:h-8" /> Panel Superadmin
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground">Control total de la plataforma y acceso God Mode.</p>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-red-100 bg-red-50/50 shadow-sm">
          <CardHeader className="pb-2 p-4">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-red-800 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Organizaciones
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-red-900">{stats.totalOrgs}</div>
            <div className="flex items-center gap-1 text-xs text-red-600 mt-1 font-medium">
              <CheckCircle2 className="w-3 h-3" /> {stats.activeOrgs} activas
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm">
          <CardHeader className="pb-2 p-4">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Usuarios Globales
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">Registrados en total</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm bg-slate-900 text-white border-slate-800 hidden sm:block">
          <CardHeader className="pb-2 p-4">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">Estado Sistema</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-green-400">ONLINE</div>
            <p className="text-xs text-slate-400 mt-1">v1.0.0 Stable</p>
          </CardContent>
        </Card>
      </div>

      {/* MAIN LIST CARD */}
      <Card className="border-none shadow-none bg-transparent sm:bg-card sm:border sm:shadow">
        <CardHeader className="p-0 sm:p-6 mb-4 sm:mb-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-lg hidden sm:block">Listado de Empresas</CardTitle>
            
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nombre o código..." 
                className="pl-9 bg-white sm:bg-background w-full" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="text-center py-10 text-muted-foreground">Cargando datos...</div>
          ) : filteredTenants.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground bg-muted/20 rounded-lg border-2 border-dashed">
              No se encontraron empresas.
            </div>
          ) : (
            <>
              {/* --- VISTA MÓVIL (CARDS) --- */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredTenants.map((t) => (
                  <Card key={t.id} className="p-4 shadow-sm border-l-4" style={{ borderLeftColor: t.activo ? '#22C55E' : '#94A3B8' }}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-slate-100 border flex items-center justify-center p-1 shrink-0">
                          {t.logo_url ? (
                            <img src={t.logo_url} className="w-full h-full object-contain" alt="logo" />
                          ) : (
                            <Building2 className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-foreground">{t.nombre}</h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                            <Hash className="w-3 h-3" /> {t.codigo}
                          </div>
                        </div>
                      </div>
                      <Badge variant={t.activo ? "default" : "secondary"} className={t.activo ? "bg-green-100 text-green-700 hover:bg-green-100 border-green-200" : ""}>
                        {t.activo ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-dashed">
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3 mr-1" />
                        {format(new Date(t.created_at), "dd MMM yyyy")}
                      </div>
                      
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 text-xs border-red-200 text-red-700 bg-red-50 hover:bg-red-100 hover:text-red-800"
                        onClick={() => impersonateTenant(t.id)}
                      >
                        <LogIn className="w-3 h-3 mr-1.5" /> Acceder
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              {/* --- VISTA ESCRITORIO (TABLA) --- */}
              <div className="hidden md:block rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Organización</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha Creación</TableHead>
                      <TableHead className="text-right">Acceso</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTenants.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded bg-slate-50 border flex items-center justify-center p-0.5">
                              {t.logo_url ? (
                                <img src={t.logo_url} className="w-full h-full object-contain" alt="logo" />
                              ) : (
                                <Building2 className="w-4 h-4 text-slate-300" />
                              )}
                            </div>
                            <span className="font-medium text-sm">{t.nombre}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{t.codigo}</TableCell>
                        <TableCell>
                          {t.activo ? 
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 shadow-none font-normal">Activa</Badge> : 
                            <Badge variant="secondary" className="font-normal">Inactiva</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(t.created_at), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800 h-8"
                            onClick={() => impersonateTenant(t.id)}
                          >
                            <LogIn className="w-3 h-3 mr-2" /> God Mode
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}