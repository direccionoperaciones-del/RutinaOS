import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { 
  LayoutDashboard, CheckSquare, MessageSquare, Activity, FileCheck, 
  Image, FileText, Settings, LogOut, Menu, X, Store, Calendar, 
  UserCog, Link, ClipboardList, Package, History, Settings2, 
  Bell, Users, CalendarOff, CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";
import { ModeToggle } from "@/components/mode-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Componente para items del sidebar
const SidebarItem = ({ icon: Icon, label, path, active, onClick, badgeCount }: any) => (
  <div
    className={cn(
      "flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer rounded-lg mb-1 group",
      active 
        ? "bg-primary text-primary-foreground shadow-sm" 
        : "text-sidebar-foreground/70 hover:text-white hover:bg-white/10"
    )}
    onClick={onClick}
  >
    <div className="flex items-center gap-3">
      <Icon className={cn("h-5 w-5 transition-transform group-hover:scale-110", active ? "text-primary-foreground" : "text-sidebar-foreground/70 group-hover:text-primary")} />
      <span>{label}</span>
    </div>
    {badgeCount > 0 && (
      <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center shadow-sm">
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    )}
  </div>
);

const SidebarGroup = ({ title, children }: any) => (
  <div className="mb-6 px-3">
    <h3 className="px-3 text-[11px] font-bold text-sidebar-foreground/40 uppercase tracking-widest mb-2 font-mono">
      {title}
    </h3>
    {children}
  </div>
);

// ... (Mantenemos NAV_CONFIG igual, solo UI cambia) ...
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
      { icon: Settings2, label: "Maestros", path: "/config/general", roles: ['director'] },
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
        if (!session) { navigate("/login"); return; }

        const { data: profile } = await supabase
          .from('profiles')
          .select('*, tenants(nombre)')
          .eq('id', session.user.id)
          .single();
        
        setUserProfile(profile);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    checkUser();
    
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') navigate("/login");
    });
    return () => authListener.subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const hasPermission = (roles: string[]) => {
    if (!userProfile) return false;
    if (roles.includes('all')) return true;
    return roles.includes(userProfile.role);
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-background flex font-sans">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar - Mova Navy Style */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full w-[260px] bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-transform duration-300 lg:static lg:translate-x-0 flex flex-col shadow-xl lg:shadow-none",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-lg shadow-[0_0_10px_rgba(52,211,153,0.3)]">
              <CheckCircle className="w-5 h-5" strokeWidth={3} />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">Movacheck</span>
          </div>
          <button className="lg:hidden ml-auto text-sidebar-foreground/70" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-6 space-y-1 custom-scrollbar">
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
                    onClick={() => { navigate(item.path); setIsMobileMenuOpen(false); }}
                  />
                ))}
              </SidebarGroup>
            );
          })}
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-white/10 bg-black/20 shrink-0">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="h-9 w-9 border border-white/10 shadow-sm">
              <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                {userProfile?.nombre?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{userProfile?.nombre}</p>
              <p className="text-xs text-white/50 truncate capitalize">{userProfile?.role}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10 h-9"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" /> Cerrar Sesión
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-muted/20">
        {/* Header */}
        <header className="h-16 border-b bg-background/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-4 lg:px-8 shadow-sm">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
            {userProfile?.tenants && (
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
                <Store className="w-3.5 h-3.5" />
                <span className="font-medium text-foreground">{userProfile.tenants.nombre}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button variant="ghost" size="icon" className="relative rounded-full" onClick={() => navigate('/messages')}>
              <Bell className="w-5 h-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-background" />
              )}
            </Button>
          </div>
        </header>

        {/* Content Scrollable */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 animate-in fade-in duration-500">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;