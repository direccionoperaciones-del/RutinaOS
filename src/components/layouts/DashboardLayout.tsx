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
  Store,
  Calendar,
  Link,
  ClipboardList,
  Package,
  History,
  Settings2,
  Bell,
  Users,
  CalendarOff,
  Check
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Sidebar Group Component
const SidebarGroup = ({ title, children }: any) => (
  <div className="mb-6 px-4">
    <h3 className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400/80">
      {title}
    </h3>
    <div className="space-y-1">
      {children}
    </div>
  </div>
);

// Sidebar Item Component
const SidebarItem = ({ icon: Icon, label, path, active, onClick, badgeCount }: any) => (
  <button
    className={cn(
      "group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
      active 
        ? "bg-movacheck-blue text-white shadow-md shadow-blue-900/20" 
        : "text-slate-400 hover:bg-white/5 hover:text-white"
    )}
    onClick={onClick}
  >
    <div className="flex items-center gap-3">
      <Icon className={cn("h-5 w-5", active ? "text-white" : "text-slate-400 group-hover:text-white")} />
      <span>{label}</span>
    </div>
    {badgeCount > 0 && (
      <span className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
        active ? "bg-white text-movacheck-blue" : "bg-movacheck-blue text-white"
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
      <div className="min-h-screen flex items-center justify-center bg-movacheck-navy">
        <div className="flex flex-col items-center gap-4">
          <div className="h-20 w-20 rounded-full overflow-hidden shadow-lg shadow-blue-500/20">
             <img 
               src="https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg" 
               alt="Movacheck" 
               className="h-full w-full object-cover" 
             />
          </div>
          <p className="text-sm font-medium text-slate-400 animate-pulse">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-movacheck-navy/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-movacheck-navy text-white transition-transform duration-300 lg:translate-x-0 border-r border-white/5 shadow-2xl",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo Area (Sidebar) */}
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-white/5 bg-movacheck-navy">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 overflow-hidden rounded-lg">
              <img 
                src="https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg" 
                alt="Movacheck" 
                className="h-full w-full object-cover" 
              />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">Movacheck</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-6 sidebar-scroll">
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

        {/* User Profile */}
        <div className="border-t border-white/5 p-4 bg-black/20">
          <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3 hover:bg-white/10 transition-colors cursor-pointer group" onClick={handleLogout}>
            <Avatar className="h-9 w-9 border border-white/10">
              <AvatarFallback className="bg-slate-800 text-white font-bold text-xs">
                {userProfile?.nombre?.[0]}{userProfile?.apellido?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white group-hover:text-movacheck-blue transition-colors">
                {userProfile?.nombre}
              </p>
              <p className="truncate text-xs text-slate-400 capitalize">
                {userProfile?.role}
              </p>
            </div>
            <LogOut className="h-4 w-4 text-slate-500 group-hover:text-white transition-colors" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col lg:pl-[260px] transition-all duration-300 min-h-screen">
        
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/80 backdrop-blur-md px-6 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 -ml-2 hover:bg-accent rounded-full text-foreground" 
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            
            {/* Mobile/Tablet Brand (Visible when sidebar is hidden) */}
            <div className="lg:hidden flex items-center gap-2">
                <img 
                  src="https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg" 
                  alt="Movacheck" 
                  className="h-8 w-8 rounded-full object-cover" 
                />
                <span className="font-bold text-lg tracking-tight">Movacheck</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            
            <div 
              className="relative cursor-pointer p-2 hover:bg-accent rounded-full transition-colors" 
              onClick={() => navigate('/messages')}
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-card" />
              )}
            </div>

            <div className="h-8 w-px bg-border mx-1 hidden sm:block" />

            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/settings')}>
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium leading-none text-foreground">{userProfile?.nombre}</p>
                <p className="text-xs text-muted-foreground mt-1">{userProfile?.tenants?.nombre}</p>
              </div>
              <Avatar className="h-8 w-8 ring-2 ring-transparent group-hover:ring-movacheck-blue transition-all">
                <AvatarFallback className="bg-gradient-to-br from-movacheck-blue to-indigo-600 text-white font-bold text-xs">
                  {userProfile?.nombre?.[0]}{userProfile?.apellido?.[0]}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 p-4 md:p-8 bg-background">
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;