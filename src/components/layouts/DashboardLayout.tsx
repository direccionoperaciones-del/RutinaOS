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
  History,
  Settings2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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

// Definición de roles permitidos por ítem
// 'all' significa acceso para todos los roles autenticados
const NAV_CONFIG = [
  {
    group: "Operación",
    items: [
      { 
        icon: LayoutDashboard, 
        label: "Dashboard", 
        path: "/", 
        roles: ['all'] 
      },
      { 
        icon: CheckSquare, 
        label: "Mis Tareas", 
        path: "/tasks", 
        roles: ['administrador', 'lider', 'director'] // Auditor no ejecuta tareas
      },
      { 
        icon: MessageSquare, 
        label: "Mensajes", 
        path: "/messages", 
        roles: ['all'] 
      },
      { 
        icon: Activity, 
        label: "Centro de Mando", 
        path: "/command-center", 
        roles: ['director', 'lider'] 
      },
    ]
  },
  {
    group: "Control",
    items: [
      { 
        icon: FileCheck, 
        label: "Auditoría Calidad", 
        path: "/audit", 
        roles: ['director', 'lider', 'auditor'] 
      },
      { 
        icon: History, 
        label: "Log del Sistema", 
        path: "/system-audit", 
        roles: ['director'] 
      },
      { 
        icon: Image, 
        label: "Galería", 
        path: "/gallery", 
        roles: ['director', 'lider', 'auditor'] 
      },
      { 
        icon: FileText, 
        label: "Reportes", 
        path: "/reports", 
        roles: ['director', 'lider', 'auditor'] 
      },
    ]
  },
  {
    group: "Configuración",
    items: [
      { 
        icon: Store, 
        label: "Puntos de Venta", 
        path: "/config/pdv", 
        roles: ['director'] 
      },
      { 
        icon: ClipboardList, 
        label: "Rutinas", 
        path: "/config/routines", 
        roles: ['director'] 
      },
      { 
        icon: Link, 
        label: "Asignación Rutinas", 
        path: "/config/assignments", 
        roles: ['director'] 
      },
      { 
        icon: Package, 
        label: "Inventarios", 
        path: "/config/inventory", 
        roles: ['director'] 
      },
      { 
        icon: Calendar, 
        label: "Calendario", 
        path: "/calendar", 
        roles: ['director', 'lider'] 
      },
      { 
        icon: UserCog, 
        label: "Gestión Personal", 
        path: "/personnel", 
        roles: ['director'] 
      },
      { 
        icon: Settings2, 
        label: "Parametrización", 
        path: "/config/general", 
        roles: ['director'] 
      },
      { 
        icon: Settings, 
        label: "Ajustes", 
        path: "/settings", 
        roles: ['all'] 
      },
    ]
  }
];

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check auth and load profile
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate("/login");
          return;
        }

        // Fetch profile
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*, tenants(nombre)')
          .eq('id', session.user.id)
          .single();
        
        if (error) throw error;
        
        setUserProfile(profile);
      } catch (error) {
        console.error("Error loading profile:", error);
        // Fallback o redirect si falla crítico
      } finally {
        setLoading(false);
      }
    };

    checkUser();

    // Listen for auth changes
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

  const hasPermission = (roles: string[]) => {
    if (!userProfile) return false;
    if (roles.includes('all')) return true;
    return roles.includes(userProfile.role);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-card border-r transition-transform duration-200 lg:static lg:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-full flex flex-col">
          {/* Logo Area */}
          <div className="p-6 border-b flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-primary">Operaciones</h1>
              {userProfile && (
                <p className="text-xs text-muted-foreground mt-1 font-medium">
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

          {/* User Info */}
          <div className="p-4 bg-muted/30 border-b">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold uppercase">
                {userProfile?.nombre?.[0] || 'U'}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">
                  {userProfile?.nombre} {userProfile?.apellido}
                </p>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <p className="text-xs text-muted-foreground capitalize">
                    {userProfile?.role}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto py-6 px-3">
            {NAV_CONFIG.map((group, idx) => {
              // Filtrar items permitidos para el rol actual
              const allowedItems = group.items.filter(item => hasPermission(item.roles));
              
              if (allowedItems.length === 0) return null;

              return (
                <SidebarGroup key={idx} title={group.group}>
                  {allowedItems.map((item) => (
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
              );
            })}
          </div>

          {/* Footer */}
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden h-16 border-b flex items-center px-4 bg-card shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu className="h-6 w-6" />
          </Button>
          <span className="ml-4 font-semibold">Menú</span>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-muted/10">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;