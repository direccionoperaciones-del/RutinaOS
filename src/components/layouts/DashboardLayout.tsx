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
  Search,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

// Sidebar Group Component
const SidebarGroup = ({ title, children }: any) => (
  <div className="mb-6 px-4">
    <h3 className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-slate-500">
      {title}
    </h3>
    <div className="space-y-1">
      {children}
    </div>
  </div>
);

// Sidebar Item Component - Active state blue
const SidebarItem = ({ icon: Icon, label, path, active, onClick, badgeCount }: any) => (
  <button
    className={cn(
      "group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
      active 
        ? "bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 shadow-sm" // Azul activo
        : "text-slate-400 hover:bg-white/5 hover:text-white border-l-4 border-transparent"
    )}
    onClick={onClick}
  >
    <div className="flex items-center gap-3">
      <Icon className={cn("h-5 w-5 transition-colors", active ? "text-blue-400" : "text-slate-500 group-hover:text-white")} />
      <span>{label}</span>
    </div>
    {badgeCount > 0 && (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
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
      { icon: FileCheck, label: "Auditoría Calidad", path: "/audit", roles: ['director', 'lider', 'auditor'] },
      { icon: History, label: "Log del Sistema", path: "/system-audit", roles: ['director'] },
      { icon: Image, label: "Galería", path: "/gallery", roles: ['director', 'lider', 'auditor'] },
      { icon: FileText, label: "Reportes", path: "/reports", roles: ['director', 'lider', 'auditor'] },
    ]
  },
  {
    group: "Configuración",
    items: [
      { icon: Store, label: "Puntos de Venta", path: "/config/pdv", roles: ['director'] },
      { icon: Users, label: "Gestión de Usuarios", path: "/config/users", roles: ['director'] },
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-movacheck-blue border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-slate-500 animate-pulse">Cargando Movacheck...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-movacheck-navy/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Dark Aesthetic (Fixed) */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col bg-movacheck-navy text-white transition-transform duration-300 lg:translate-x-0 shadow-xl border-r border-white/5",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar Header / Logo */}
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-white/10 bg-movacheck-navy/50">
          <div className="flex items-center gap-3">
            {/* Logo Placeholder */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-movacheck-blue text-white font-bold text-xl shadow-lg shadow-blue-900/50">
              M
            </div>
            <span className="text-lg font-bold tracking-tight text-white">Movacheck</span>
          </div>
        </div>

        {/* Sidebar Navigation */}
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

        {/* Sidebar User Profile (Bottom) */}
        <div className="border-t border-white/10 p-4 bg-black/10">
          <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3 hover:bg-white/10 transition-colors cursor-pointer group" onClick={handleLogout}>
            <Avatar className="h-9 w-9 border-2 border-movacheck-blue">
              <AvatarFallback className="bg-slate-800 text-white font-bold">
                {userProfile?.nombre?.[0]}
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
            <LogOut className="h-4 w-4 text-slate-400 group-hover:text-white" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col lg:pl-[240px] transition-all duration-300">
        
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/80 backdrop-blur-md px-6 shadow-sm transition-all border-slate-200">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 -ml-2 hover:bg-slate-100 rounded-full" 
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6 text-slate-600" />
            </button>
            
            {/* Search Bar (Hidden on small mobile) */}
            <div className="hidden md:flex items-center gap-2 relative">
              <Search className="absolute left-3 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Buscar..." 
                className="h-9 w-64 rounded-full bg-slate-100 border-transparent pl-9 focus-visible:bg-white focus-visible:border-movacheck-blue transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            
            <div 
              className="relative cursor-pointer p-2 hover:bg-slate-100 rounded-full transition-colors" 
              onClick={() => navigate('/messages')}
            >
              <Bell className="h-5 w-5 text-slate-600" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
              )}
            </div>

            <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium leading-none text-slate-700">Hola, {userProfile?.nombre}</p>
                <p className="text-xs text-slate-500 mt-1">{userProfile?.tenants?.nombre}</p>
              </div>
              <Avatar className="h-8 w-8 ring-2 ring-offset-2 ring-blue-100 cursor-pointer" onClick={() => navigate('/settings')}>
                <AvatarFallback className="bg-gradient-to-br from-movacheck-blue to-indigo-600 text-white font-bold text-xs">
                  {userProfile?.nombre?.[0]}{userProfile?.apellido?.[0]}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-50/50">
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;