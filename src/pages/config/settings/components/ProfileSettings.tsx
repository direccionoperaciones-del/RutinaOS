import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { User, Camera, Loader2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export function ProfileSettings() {
  const { toast } = useToast();
  const { user, profile } = useCurrentUser();
  
  const [formData, setFormData] = useState({ nombre: "", apellido: "" });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [imgKey, setImgKey] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({ nombre: profile.nombre || "", apellido: profile.apellido || "" });
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  const handleUpdateProfile = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          nombre: formData.nombre,
          apellido: formData.apellido
        })
        .eq('id', user?.id);

      if (error) throw error;
      toast({ title: "Perfil actualizado", description: "Tus datos personales han sido guardados." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    setUploading(true);
    
    try {
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user?.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setImgKey(Date.now());
      toast({ title: "Avatar actualizado", description: "Tu foto de perfil ha sido cambiada." });

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
          <User className="w-4 h-4 text-primary" /> Información Personal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar className="h-20 w-20 cursor-pointer">
              <AvatarImage src={`${avatarUrl}?t=${imgKey}`} />
              <AvatarFallback className="text-lg bg-primary/10 text-primary">
                {formData.nombre?.[0]}{formData.apellido?.[0]}
              </AvatarFallback>
            </Avatar>
            <label 
              htmlFor="avatar-upload" 
              className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
            >
              <Camera className="w-6 h-6" />
            </label>
            <input 
              id="avatar-upload" 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleAvatarUpload}
              disabled={uploading}
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Foto de Perfil</p>
            <p className="text-xs text-muted-foreground">Haz clic en la imagen para cambiarla.</p>
            {uploading && <p className="text-xs text-blue-600 animate-pulse">Subiendo...</p>}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input 
            id="nombre" 
            value={formData.nombre} 
            onChange={(e) => setFormData({...formData, nombre: e.target.value})} 
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="apellido">Apellido</Label>
          <Input 
            id="apellido" 
            value={formData.apellido} 
            onChange={(e) => setFormData({...formData, apellido: e.target.value})} 
          />
        </div>
        <div className="grid gap-2">
          <Label>Email</Label>
          <Input value={profile?.email} disabled className="bg-muted" />
        </div>
        <div className="grid gap-2">
          <Label>Rol</Label>
          <Input value={profile?.role} disabled className="bg-muted capitalize" />
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button onClick={handleUpdateProfile} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar Cambios
        </Button>
      </CardFooter>
    </Card>
  );
}