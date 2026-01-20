import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, CalendarOff, UserCog, Mail, Edit, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AbsenceModal } from "./AbsenceModal";
import { EditUserModal } from "./EditUserModal";

export default function PersonnelPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [absences, setAbsences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    // 1. Usuarios - Traemos todos los perfiles del tenant (gracias a RLS)
    const { data: usersData, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .order('nombre');

    if (userError) {
      toast({ variant: "destructive", title: "Error", description: "Error cargando usuarios" });
    } else {
      setUsers(usersData || []);
    }

    // 2. Ausencias futuras o vigentes
    const today = new Date().toISOString().split('T')[0];
    const { data: absData } = await supabase
      .from('user_absences')
      .select(`
        *,
        absence_types (nombre),
        profiles:user_id (nombre, apellido),
        receptor:receptor_id (nombre, apellido)
      `)
      .gte('fecha_hasta', today)
      .order('fecha_desde');
    
    if (absData) setAbsences(absData);
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddAbsence = (user?: any) => {
    setSelectedUser(user);
    setIsAbsenceModalOpen(true);
  };

  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const filteredUsers = users.filter(u => 
    (u.nombre + ' ' + u.apellido).toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'director': return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 border-purple-200">Director</Badge>;
      case 'lider': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200">Líder</Badge>;
      case 'auditor': return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200">Auditor</Badge>;
      default: return <Badge variant="outline" className="capitalize">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gestión de Personal</h2>
          <p className="text-muted-foreground">Administra roles, accesos y ausencias del equipo.</p>
        </div>
        <Button onClick={() => handleAddAbsence(null)}>
          <CalendarOff className="w-4 h-4 mr-2" /> Registrar Novedad
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Columna Izquierda: Lista de Usuarios */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Usuarios Registrados</CardTitle>
            <CardDescription>Listado completo de cuentas en el sistema.</CardDescription>
            <div className="relative mt-2">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o email..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Gestionar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className={!user.activo ? "opacity-60 bg-muted/30" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className={!user.activo ? "bg-gray-200" : ""}>
                            {user.nombre?.[0]}{user.apellido?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {user.nombre} {user.apellido}
                            {!user.activo && <span className="text-[10px] text-destructive font-bold uppercase">(Inactivo)</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getRoleBadge(user.role)}
                    </TableCell>
                    <TableCell className="text-center">
                       {user.activo ? (
                         <div className="flex justify-center" title="Acceso Permitido">
                           <CheckCircle2 className="w-5 h-5 text-green-500" />
                         </div>
                       ) : (
                         <div className="flex justify-center" title="Acceso Bloqueado">
                           <XCircle className="w-5 h-5 text-destructive" />
                         </div>
                       )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEditUser(user)} title="Gestionar Rol y Estado">
                          <UserCog className="w-4 h-4 mr-2" />
                          Editar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                   <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      No se encontraron usuarios.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Columna Derecha: Ausencias Vigentes */}
        <Card>
          <CardHeader>
            <CardTitle>Novedades Activas</CardTitle>
            <CardDescription>Personal ausente próximamente.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {absences.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <CalendarOff className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Sin ausencias programadas</p>
                </div>
              ) : (
                absences.map(abs => (
                  <div key={abs.id} className="p-3 border rounded-md bg-white shadow-sm text-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold">{abs.profiles?.nombre} {abs.profiles?.apellido}</span>
                      <Badge variant="secondary" className="text-[10px]">{abs.absence_types?.nombre}</Badge>
                    </div>
                    <div className="text-muted-foreground mb-2 text-xs flex items-center gap-1">
                      <CalendarOff className="w-3 h-3" />
                      {format(new Date(abs.fecha_desde), "dd MMM", { locale: es })} - {format(new Date(abs.fecha_hasta), "dd MMM", { locale: es })}
                    </div>
                    {abs.politica === 'reasignar' ? (
                       <div className="text-xs flex items-center gap-1 text-blue-700 bg-blue-50 p-2 rounded border border-blue-100">
                         <UserCog className="w-3 h-3" /> 
                         <span>Cubierto por: <strong>{abs.receptor?.nombre} {abs.receptor?.apellido}</strong></span>
                       </div>
                    ) : (
                      <div className="text-xs flex items-center gap-1 text-orange-700 bg-orange-50 p-2 rounded border border-orange-100">
                         <ShieldAlert className="w-3 h-3" /> 
                         <span>Tareas omitidas (No se generan)</span>
                       </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AbsenceModal 
        open={isAbsenceModalOpen} 
        onOpenChange={setIsAbsenceModalOpen} 
        onSuccess={fetchData}
        preselectedUserId={selectedUser?.id}
      />

      <EditUserModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        userToEdit={selectedUser}
        onSuccess={fetchData}
      />
    </div>
  );
}