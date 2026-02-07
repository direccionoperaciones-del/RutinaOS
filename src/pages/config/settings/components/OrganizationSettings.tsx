import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building, Loader2, Save, Camera, AlertTriangle, ShieldAlert } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export function OrganizationSettings() {
  const { toast } = useToast();
  const { profile, tenantId, isSuperAdmin } = useCurrentUser();
  
  const [orgData, setOrgData] = useState({ nombre: "" });
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [imgKey, setImgKey] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isDirector = profile?.role === 'director';
  const canEditOrg = isDirector || isSuperAdmin;

  useEffect(() => {
    const loadTenantData = async () => {
      if (!tenantId) return;
      const { data } = await supabase
        .from('tenants')
        .select('nombre, logo_url')
        .eq('id', tenantId)
        .single();
        
      if (data) {
        setOrgData({ nombre: data.nombre });
        setOrgLogoUrl(data.logo_url);
      }
    };
    loadTenantData();
  }, [tenantId]);

  const handleUpdateOrganization = async () => {
    if (!tenantId || !canEditOrg) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ nombre: orgData.nombre })
        .eq('id', tenantId);

      if (error) throw error;
      toast({ title: "Organización actualizada", description: "El nombre de la empresa ha sido guardado." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleOrgLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !tenantId || !canEditOrg) return;
    setUploading(true);
    
    try {
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `org_${tenantId}.${fileExt}`;
      const filePath = `${fileName}`; 
      const bucketName = 'LogoApp'; 

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('tenants')
        .update({ logo_url: publicUrl })
        .eq('id', tenantId);

      if (updateError) throw updateError;

      setOrgLogoUrl(publicUrl);
      setImgKey(Date.now());
      toast({ title: "Logo actualizado", description: "El logo de la organización ha sido cambiado." });

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al subir", description: error.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building className="w-4 h-4 text-primary" /> Información de la Organización
        </CardTitle>
        <CardDescription>
          Estos datos aparecen en los reportes y en el encabezado de la aplicación.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {!canEditOrg && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center gap-2 text-sm text-blue-800">
            <ShieldAlert className="w-4 h-4" />
            <span>Solo el <strong>Director</strong> puede modificar estos datos.</span>
          </div>
        )}

        {/* Logo Upload */}
        <div className={`flex flex-col items-center gap-4 sm:flex-row p-4 border rounded-lg bg-muted/20 ${!canEditOrg ? 'opacity-70 pointer-events-none' : ''}`}>
          <div className="relative group shrink-0">
            <div className="h-24 w-24 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-white">
              {orgLogoUrl ? (
                <img src={`${orgLogoUrl}?t=${imgKey}`} alt="Logo" className="h-full w-full object-contain p-1" />
              ) : (
                <Building className="h-8 w-8 text-muted-foreground opacity-20" />
              )}
            </div>
            
            {canEditOrg && (
              <label 
                htmlFor="org-logo-upload" 
                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-lg text-white text-xs font-medium"
              >
                <Camera className="w-4 h-4 mr-1" /> Cambiar
              </label>
            )}
            
            <input 
              id="org-logo-upload" 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleOrgLogoUpload}
              disabled={uploading || !canEditOrg}
            />
          </div>
          <div className="space-y-1 text-center sm:text-left flex-1">
            <h4 className="font-medium text-sm">Logotipo Corporativo</h4>
            <p className="text-xs text-muted-foreground">Se recomienda formato PNG con fondo transparente. Tamaño máx: 2MB.</p>
            {uploading && <p className="text-xs text-blue-600 animate-pulse font-medium">Subiendo imagen...</p>}
          </div>
        </div>

        {/* Organization Name */}
        <div className="space-y-2">
          <Label>Nombre de la Empresa</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Building className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                value={orgData.nombre} 
                onChange={(e) => setOrgData({...orgData, nombre: e.target.value})} 
                className="pl-9" 
                placeholder="Nombre de tu empresa"
                disabled={!canEditOrg}
              />
            </div>
            {canEditOrg && (
              <Button onClick={handleUpdateOrganization} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </div>

        {!isSuperAdmin && isDirector && (
          <div className="p-4 bg-yellow-50 text-yellow-800 rounded-md text-xs border border-yellow-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Si eres el <strong>Director</strong>, los cambios realizados aquí afectarán a todos los usuarios de la organización.
            </p>
          </div>
        )}

        {isSuperAdmin && (
          <div className="p-4 bg-red-50 text-red-800 rounded-md text-xs border border-red-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              <strong>GOD MODE ACTIVO:</strong> Estás editando la organización seleccionada en el menú superior ({orgData.nombre}).
            </p>
          </div>
        )}

      </CardContent>
    </Card>
  );
}