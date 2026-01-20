import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, CalendarOff, Edit, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AbsenceModal } from "./AbsenceModal";
import { EditUserModal } from "./EditUserModal";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PersonnelPage() {
  const { toast } = useToast();
  const { tenantId, user } = useCurrentUser();
  const [users, setUsers] = useState<any[]>([]);
  const [absences, setAbsences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modals
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Invite State
  const [inviteData, setInviteData] = useState({ email: "", nombre: "", apellido: "", role: "administrador" });

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    
    // 1. Usuarios del Tenant
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('nombre');
    
    setUsers(usersData || []);

    // 2. Ausencias
    const today = new Date().toISOString().split('T')[0];
    const { data: absData } = await supabase
      .from('user_absences')
      .select(`*, absence_types(nombre), profiles:user_id(nombre, apellido)`)
      .eq('tenant_id', tenantId)
      .gte('fecha_hasta', today)
      .order('fecha_desde');
    
    setAbsences(absData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const handleInvite = async () => {
    if (!inviteData.email || !inviteData.nombre) return toast({variant:"destructive", title:"Datos incompletos"});
    
    // Nota: Como no podemos usar Admin API client-side, creamos el perfil placeholder.
    // El usuario real se creará cuando se registre con ese email, y el trigger 'handle_new_user'
    // debería manejarlo. OJO: El trigger actual crea un tenant nuevo.
    // Para invitar a un tenant EXISTENTE, el flujo ideal es:
    // 1. Admin envía link de registro con token o instrucciones.
    // 2. Aquí solo mostramos instrucciones.
    
    toast({
      title: "Invitación simulada", 
      description: "En una app real, esto enviaría un email con un link mágico. Por ahora, pídeles que se registren manualmente." 
    });
    setIsInviteModalOpen(false);
  };

  const filteredUsers = users.filter(u => 
    (u.nombre + ' ' + u.apellido).toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gestión de Personal</h2>
          <p className="text-muted-foreground">Administra el equipo y programa ausencias.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsInviteModalOpen(true)} variant="default">
            <UserPlus className="w-4 h-4 mr-2" /> Agregar Usuario
          </Button>
          <Button onClick={() => { setSelectedUser(null); setIsAbsenceModalOpen(true); }} variant="outline">
            <CalendarOff className="w-4 h-4 mr-2" /> Registrar Novedad
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Equipo de Trabajo</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar usuario..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar><AvatarFallback>{user.nombre?.[0]}{user.apellido?.[0]}</AvatarFallback></Avatar>
                        <div>
                          <div className="font-medium">{user.nombre} {user.apellido}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{user.role}</Badge></TableCell>
                    <TableCell>
                       <div className={`w-2 h-2 rounded-full ${user.activo ? 'bg-green-500' : 'bg-gray-300'}`} title={user.activo ? "Activo" : "Inactivo"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedUser(user); setIsEditModalOpen(true); }}>
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ausencias</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {absences.length === 0 ? <p className="text-sm text-muted-foreground text-center">Sin ausencias activas.</p> : 
                absences.map(abs => (
                  <div key={abs.id} className="p-3 border rounded-md bg-muted/20 text-sm">
                    <div className="font-semibold">{abs.profiles?.nombre}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(abs.fecha_desde), "dd MMM")} - {format(new Date(abs.fecha_hasta), "dd MMM")}</div>
                  </div>
                ))
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal Invitar */}
      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invitar Usuario</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={inviteData.email} onChange={e => setInviteData({...inviteData, email: e.target.value})} placeholder="correo@empresa.com" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={inviteData.nombre} onChange={e => setInviteData({...inviteData, nombre: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Apellido</Label>
                <Input value={inviteData.apellido} onChange={e => setInviteData({...inviteData, apellido: e.target.value})} />
              </div>
            </div>
             <div className="space-y-2">
                <Label>Rol Inicial</Label>
                <Select value={inviteData.role} onValueChange={(val) => setInviteData({...inviteData, role: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrador">Administrador</SelectItem>
                    <SelectItem value="lider">Líder</SelectItem>
                    <SelectItem value="auditor">Auditor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInviteModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite}>Enviar Instrucciones</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AbsenceModal open={isAbsenceModalOpen} onOpenChange={setIsAbsenceModalOpen} onSuccess={fetchData} preselectedUserId={selectedUser?.id} />
      <EditUserModal open={isEditModalOpen} onOpenChange={setIsEditModalOpen} userToEdit={selectedUser} onSuccess={fetchData} />
    </div>
  );
}