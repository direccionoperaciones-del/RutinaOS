import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ProfileSettings } from "./settings/components/ProfileSettings";
import { SecuritySettings } from "./settings/components/SecuritySettings";
import { NotificationSettings } from "./settings/components/NotificationSettings";
import { OrganizationSettings } from "./settings/components/OrganizationSettings";

export default function SettingsPage() {
  const { loading: loadingProfile } = useCurrentUser();

  if (loadingProfile) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Ajustes y Perfil</h2>
        <p className="text-muted-foreground">Gestiona tu información personal y notificaciones.</p>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="account">Mi Cuenta</TabsTrigger>
          <TabsTrigger value="organization">Organización</TabsTrigger>
        </TabsList>

        {/* --- PESTAÑA MI CUENTA --- */}
        <TabsContent value="account" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Tarjeta Perfil */}
            <ProfileSettings />

            {/* Tarjeta Seguridad & Notificaciones */}
            <div className="space-y-6">
              <SecuritySettings />
              <NotificationSettings />
            </div>
          </div>
        </TabsContent>

        {/* --- PESTAÑA ORGANIZACIÓN --- */}
        <TabsContent value="organization" className="space-y-6 mt-6">
          <OrganizationSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}