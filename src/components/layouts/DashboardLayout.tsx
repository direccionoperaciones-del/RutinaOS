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
  Settings2,
  Bell,
  Users,
  CalendarOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/use-notifications";

// Componente para items del sidebar
const SidebarItem = ({ icon: Icon, label, path, active, onClick, badgeCount }: any) => (
  <div
    className={cn(
      "flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors cursor-pointer rounded-lg mb-1",
      active 
        ? "bg-primary text-primary-foreground" 
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    )}
    onClick={onClick}
  >
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </div>
    {badgeCount > 0 && (
      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    )}
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
        roles: ['administrador', 'lider', 'director'] 
      },
      { 
        icon: MessageSquare, 
        label: "Mensajes", 
        path: "/messages", 
        roles: ['all'],
        showBadge: true
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
        icon: Users, 
        label: "Gestión de Usuarios", 
        path: "/config/users", 
        roles: ['director'] 
      },
      { 
        icon: CalendarOff, 
        label: "Novedades Usuarios", 
        path: "/config/absences", 
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
        roles: ['director', 'lider', 'administrador'] 
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
  
  const { unreadCount } = useNotifications();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate("/login");
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*, tenants(nombre)')
          .eq('id', session.user.id)
          .single();
        
        if (error) throw error;
        setUserProfile(profile);
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
      }
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
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-card border-r transition-transform duration-200 lg:static lg:translate-x-0 flex flex-col",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-6 border-b flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold text-primary">Operaciones</h1>
            {userProfile && (
              <p className="text-xs text-muted-foreground mt-1 font-medium truncate max-w-[150px]">
                {userProfile.tenants?.nombre || 'Sin Organización'}
              </p>
            )}
          </div>
          <button className="lg:hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 bg-muted/30 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold uppercase shrink-0">
              {userProfile?.nombre?.[0] || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">
                {userProfile?.nombre}
              </p>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <p className="text-xs text-muted-foreground capitalize truncate">
                  {userProfile?.role}
                </p>
              </div>
            </div>
          </div>
          
          <div className="relative cursor-pointer hover:bg-muted p-1.5 rounded-full transition-colors" onClick={() => navigate('/messages')}>
            <Bell className="w-5 h-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-background box-content" />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-3">
          {NAV_CONFIG.map((group, idx) => {
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
                    badgeCount={item.showBadge ? unreadCount : 0}
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

        <div className="p-4 border-t shrink-0">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="lg:hidden h-16 border-b flex items-center justify-between px-4 bg-card shrink-0">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
            <span className="ml-4 font-semibold">Menú</span>
          </div>
          <div className="relative mr-2" onClick={() => navigate('/messages')}>
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '!' : unreadCount}
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-muted/10">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;