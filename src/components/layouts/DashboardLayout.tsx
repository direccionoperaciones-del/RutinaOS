import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { 
  LayoutDashboard, 
  CheckSquare, 
  MessageSquare, 
  Activity, 
  FileCheck, 
  Image, 
  FileText, 
  Settings, 
  LogOut, 
  Menu,
  X,
  Store,
  Calendar,
  UserCog,
  Link,
  ClipboardList,
  Package,
  History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SidebarItem = ({ icon: Icon, label, path, active, onClick }: any) => (
  <div
    className={cn(
      "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors cursor-pointer rounded-lg mb-1",
      active 
        ? "bg-primary text-primary-foreground" 
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    )}
    onClick={onClick}
  >
    <Icon className="h-5 w-5" />
    <span>{label}</span>
  </div>
);

const SidebarGroup = ({ title, children }: any) => (
  <div className="mb-6">
    <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
      {title}
    </h3>
    {children}
  </div>
);

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      setLoadingProfile(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      // Obtener perfil. Usamos maybeSingle para no lanzar error si no existe,
      // aunque debería existir por el fix anterior.
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, tenants(nombre)')
        .eq('id', session.user.id)
        .maybeSingle();
      
      setUserProfile(profile);
      setLoadingProfile(false);
    };

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') navigate("/login");
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Sesión cerrada",
      description: "Has cerrado sesión correctamente.",
    });
    navigate("/login");
  };

  // 1. Normalizamos el rol actual para evitar errores de mayúsculas/espacios
  // Si está cargando, asumimos 'administrador' temporalmente para no mostrar cosas de más
  const rawRole = userProfile?.role || 'administrador';
  const currentRole = rawRole.toLowerCase().trim();

  // Definición de menú con permisos
  const menuConfig = [
    {
      group: "Operación",
      items: [
        { icon: LayoutDashboard, label: "Dashboard", path: "/", roles: ['all'] },
        { icon: CheckSquare, label: "Mis Tareas", path: "/tasks", roles: ['all'] },
        { icon: MessageSquare, label: "Mensajes", path: "/messages", roles: ['all'] },
        { icon: Activity, label: "Centro de Mando", path: "/command-center", roles: ['director', 'lider'] },
      ]
    },
    {
      group: "Control",
      items: [
        { icon: FileCheck, label: "Auditoría Calidad", path: "/audit", roles: ['director', 'lider', 'auditor'] },
        { icon: History, label: "Log del Sistema", path: "/system-audit", roles: ['director'] },
        { icon: Image, label: "Galería", path: "/gallery", roles: ['director', 'lider', 'auditor'] },
        { icon: FileText, label: "Reportes", path: "/reports", roles: ['director', 'lider'] },
      ]
    },
    {
      group: "Configuración",
      items: [
        { icon: Store, label: "Puntos de Venta", path: "/config/pdv", roles: ['director'] },
        { icon: ClipboardList, label: "Rutinas", path: "/config/routines", roles: ['director'] },
        { icon: Link, label: "Asignación Rutinas", path: "/config/assignments", roles: ['director', 'lider'] },
        { icon: Package, label: "Inventarios", path: "/config/inventory", roles: ['director', 'lider'] },
        { icon: Calendar, label: "Calendario", path: "/calendar", roles: ['director', 'lider'] },
        { icon: UserCog, label: "Gestión Personal", path: "/personnel", roles: ['director', 'lider'] },
        { icon: Settings, label: "Ajustes", path: "/settings", roles: ['all'] },
      ]
    }
  ];

  const filteredMenu = menuConfig.map(group => ({
    ...group,
    items: group.items.filter(item => item.roles.includes('all') || item.roles.includes(currentRole))
  })).filter(group => group.items.length > 0);

  return (
    <div className="min-h-screen bg-background flex">
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside 
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-card border-r transition-transform duration-200 lg:static lg:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-full flex flex-col">
          <div className="p-6 border-b flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-primary">Operaciones</h1>
              {userProfile && (
                <p className="text-xs text-muted-foreground mt-1">
                  {userProfile.tenants?.nombre || 'Sin Organización'}
                </p>
              )}
            </div>
            <button 
              className="lg:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4 bg-muted/30 border-b">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {userProfile?.nombre?.[0] || 'U'}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">
                  {userProfile?.nombre} {userProfile?.apellido}
                </p>
                <div className="flex items-center gap-2">
                   <p className="text-xs text-muted-foreground capitalize">
                    {loadingProfile ? 'Cargando...' : currentRole}
                   </p>
                   {/* Debug visual sutil para que veas qué rol detecta */}
                   {currentRole === 'administrador' && !loadingProfile && (
                     <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" title="Vista restringida (Admin)" />
                   )}
                   {currentRole === 'director' && (
                     <span className="h-1.5 w-1.5 rounded-full bg-green-500" title="Vista completa (Director)" />
                   )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-6 px-3">
            {filteredMenu.map((group, idx) => (
              <SidebarGroup key={idx} title={group.group}>
                {group.items.map((item) => (
                  <SidebarItem
                    key={item.path}
                    icon={item.icon}
                    label={item.label}
                    path={item.path}
                    active={location.pathname === item.path}
                    onClick={() => {
                      navigate(item.path);
                      setIsMobileMenuOpen(false);
                    }}
                  />
                ))}
              </SidebarGroup>
            ))}
          </div>

          <div className="p-4 border-t">
            <Button 
              variant="ghost" 
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="lg:hidden h-16 border-b flex items-center px-4 bg-card">
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu className="h-6 w-6" />
          </Button>
          <span className="ml-4 font-semibold">Menú</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-muted/10">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;