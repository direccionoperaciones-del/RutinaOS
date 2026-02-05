import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { 
  LayoutDashboard, CheckSquare, MessageSquare, Activity, 
  FileCheck, Image, FileText, Settings, LogOut, Menu,
  Store, Calendar, Link, ClipboardList, Package,
  History, Settings2, Bell, Users, CalendarOff, RefreshCw,
  ChevronRight, ShieldAlert
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TenantSwitcher } from "../common/TenantSwitcher";

// Sidebar Group Component - Ajustado para fondo oscuro/color
const SidebarGroup = ({ title, children }: any) => (
  <div className="mb-6 px-4">
    <h3 className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-white/50">
      {title}
    </h3>
    <div className="space-y-1">
      {children}
    </div>
  </div>
);

// Sidebar Item Component - Ajustado para contraste sobre naranja
const SidebarItem = ({ icon: Icon, label, path, active, onClick, badgeCount }: any) => (
  <button
    className={cn(
      "group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
      active 
        ? "bg-white text-primary shadow-md ring-1 ring-black/5" 
        : "text-white/80 hover:bg-white/10 hover:text-white"
    )}
    onClick={onClick}
  >
    <div className="flex items-center gap-3">
      <Icon className={cn("h-5 w-5 transition-colors", active ? "text-primary" : "text-white/70 group-hover:text-white")} />
      <span>{label}</span>
    </div>
    {badgeCount > 0 && (
      <span className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
        active ? "bg-primary text-white" : "bg-white/20 text-white group-hover:bg-white/30"
      )}>
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    )}
  </button>
);

const NAV_CONFIG = [
  {
    group: "Operación",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/", roles: ['all'] },
      { icon: CheckSquare, label: "Mis Tareas", path: "/tasks", roles: ['administrador', 'lider', 'director'] },
      { icon: MessageSquare, label: "Mensajes", path: "/messages", roles: ['all'], showBadge: true },
      { icon: Activity, label: "Centro de Mando", path: "/command-center", roles: ['director', 'lider'] },
    ]
  },
  {
    group: "Control",
    items: [
      { icon: FileCheck, label: "Auditoría", path: "/audit", roles: ['director', 'lider', 'auditor'] },
      { icon: History, label: "Log Sistema", path: "/system-audit", roles: ['director'] },
      { icon: Image, label: "Galería", path: "/gallery", roles: ['director', 'lider', 'auditor'] },
      { icon: FileText, label: "Reportes", path: "/reports", roles: ['director', 'lider', 'auditor'] },
    ]
  },
  {
    group: "Configuración",
    items: [
      { icon: Store, label: "Puntos de Venta", path: "/config/pdv", roles: ['director'] },
      { icon: Users, label: "Usuarios", path: "/config/users", roles: ['director'] },
      { icon: CalendarOff, label: "Novedades", path: "/config/absences", roles: ['director'] },
      { icon: ClipboardList, label: "Rutinas", path: "/config/routines", roles: ['director'] },
      { icon: Link, label: "Asignaciones", path: "/config/assignments", roles: ['director'] },
      { icon: Package, label: "Inventarios", path: "/config/inventory", roles: ['director'] },
      { icon: Calendar, label: "Calendario", path: "/calendar", roles: ['director', 'lider', 'administrador'] },
      { icon: Settings2, label: "Parámetros", path: "/config/general", roles: ['director'] },
      { icon: Settings, label: "Ajustes", path: "/settings", roles: ['all'] },
    ]
  }
];

const SUPERADMIN_NAV = [
  {
    group: "Super Admin",
    items: [
      { icon: ShieldAlert, label: "Panel Global", path: "/superadmin", roles: ['superadmin'] }
    ]
  }
];

const DEFAULT_LOGO = "https://lrnzxrrjcwkmwwldfdaq.supabase.co/storage/v1/object/public/LogoApp/LogoRunop1.jpg";

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
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
          .select('*, tenants(nombre, logo_url)')
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
    localStorage.removeItem('superadmin_impersonated_tenant_id'); // Limpiar impersonación
    await supabase.auth.signOut();
    toast({
      title: "Sesión cerrada",
      description: "Has cerrado sesión correctamente.",
    });
    navigate("/login");
  };

  const handleRefreshApp = () => {
    setRefreshing(true);
    window.location.reload();
  };

  const hasPermission = (roles: string[]) => {
    if (!userProfile) return false;
    if (userProfile.role === 'superadmin') return true; // Superadmin ve todo
    if (roles.includes('all')) return true;
    return roles.includes(userProfile.role);
  };

  const appLogo = userProfile?.tenants?.logo_url || DEFAULT_LOGO;
  const tenantName = userProfile?.tenants?.nombre || "Mi Organización";
  const appName = "RunOp"; 

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6">
          <div className="h-16 w-16 rounded-xl overflow-hidden shadow-xl ring-1 ring-border">
             <img 
               src={DEFAULT_LOGO} 
               alt="Loading..." 
               className="h-full w-full object-cover" 
             />
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-1 w-24 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-progress origin-left w-full" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Iniciando sistema...</p>
          </div>
        </div>
      </div>
    );
  }

  // Combinar navegación si es superadmin
  const NAVIGATION = userProfile?.role === 'superadmin' 
    ? [...SUPERADMIN_NAV, ...NAV_CONFIG]
    : NAV_CONFIG;

  return (
    <div className="flex min-h-screen bg-background">
      
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-gradient-to-b from-primary to-orange-600 shadow-xl transition-transform duration-300 lg:translate-x-0 border-r-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-white/10 bg-black/5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 overflow-hidden rounded-lg bg-white border border-white/20 shadow-sm p-0.5 shrink-0">
              <img 
                src={appLogo} 
                alt="Logo" 
                className="h-full w-full object-contain" 
              />
            </div>
            <span className="text-lg font-bold tracking-tight text-white truncate max-w-[150px]" title={tenantName}>
              {tenantName}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6 sidebar-scroll">
          {NAVIGATION.map((group, idx) => {
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

        <div className="border-t border-white/10 bg-black/10 p-4">
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="h-9 w-9 border-2 border-white/20">
              <AvatarImage src={userProfile?.avatar_url} />
              <AvatarFallback className="bg-white/20 text-white font-bold text-xs">
                {userProfile?.nombre?.[0]}{userProfile?.apellido?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">
                {userProfile?.nombre}
              </p>
              <p className="truncate text-xs text-white/60 capitalize">
                {userProfile?.role}
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10" 
              onClick={handleLogout}
              title="Cerrar Sesión"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center justify-center gap-2 pt-4 border-t border-white/10 select-none">
            <span className="text-[10px] text-white/60 font-medium">Powered by</span>
            <div className="flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity">
              <img 
                src="https://lrnzxrrjcwkmwwldfdaq.supabase.co/storage/v1/object/public/LogoApp/BackHouseMini.jpg" 
                alt="BackHouse 360" 
                className="h-4 w-auto rounded-sm shadow-sm"
              />
              <span className="text-[10px] font-bold text-white tracking-wide">BackHouse 360</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col lg:pl-[260px] transition-all duration-300 min-h-screen">
        
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-6 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 -ml-2 hover:bg-muted rounded-full text-foreground transition-colors" 
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            
            <div className="hidden md:flex items-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{appName}</span>
              <ChevronRight className="h-4 w-4 mx-2" />
              <span className="capitalize">{location.pathname.split('/')[1] || 'Dashboard'}</span>
            </div>

            <div className="lg:hidden flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight truncate max-w-[120px] text-primary">{appName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* COMPONENTE SUPERADMIN */}
            <TenantSwitcher />

            <Button 
              variant="ghost" 
              size="icon" 
              className="text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
              onClick={handleRefreshApp}
              title="Actualizar datos"
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
            </Button>

            <ThemeToggle />
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative text-muted-foreground hover:text-primary hover:bg-primary/5" 
              onClick={() => navigate('/messages')}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive border-2 border-background animate-pulse" />
              )}
            </Button>

            <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

            <div className="flex items-center gap-3 cursor-pointer pl-1" onClick={() => navigate('/settings')}>
              <Avatar className="h-8 w-8 border border-border ring-2 ring-transparent hover:ring-primary/20 transition-all">
                <AvatarImage src={userProfile?.avatar_url} />
                <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xs">
                  {userProfile?.nombre?.[0]}{userProfile?.apellido?.[0]}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 bg-muted/10 dark:bg-black/20">
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;