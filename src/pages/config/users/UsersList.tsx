import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, UserCog, CheckCircle2, XCircle, RefreshCw, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EditUserModal } from "../personnel/EditUserModal";
import { CreateUserModal } from "../personnel/CreateUserModal";

export default function UsersList() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: usersData, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .order('nombre');

    if (userError) {
      toast({ 
        variant: "destructive", 
        title: "Error cargando usuarios", 
        description: userError.message 
      });
    } else {
      setUsers(usersData || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gestión de Usuarios</h2>
          <p className="text-muted-foreground">Administra roles, accesos y permisos del equipo.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" size="icon" onClick={fetchUsers} title="Recargar lista">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => setIsCreateModalOpen(true)} className="flex-1 sm:flex-none">
              <UserPlus className="w-4 h-4 mr-2" /> Nuevo Usuario
            </Button>
        </div>
      </div>

      <Card className="border-none shadow-none bg-transparent sm:bg-card sm:border sm:shadow">
        <CardHeader className="p-0 sm:p-6 mb-4 sm:mb-0">
          <CardTitle className="hidden sm:block">Usuarios Registrados</CardTitle>
          <CardDescription className="hidden sm:block">Listado completo de cuentas habilitadas en el sistema.</CardDescription>
          <div className="relative mt-2 max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o email..."
              className="pl-8 bg-white sm:bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          
          {/* MOBILE VIEW */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredUsers.map((user) => (
              <Card key={user.id} className={`p-4 shadow-sm flex items-center gap-4 ${!user.activo ? 'opacity-70 bg-muted/30' : ''}`}>
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback className={!user.activo ? "bg-gray-200" : ""}>
                    {user.nombre?.[0]}{user.apellido?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-sm truncate">{user.nombre} {user.apellido}</h4>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    {user.activo ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    {getRoleBadge(user.role)}
                    <Button variant="ghost" size="sm" onClick={() => handleEditUser(user)} className="h-7 text-xs">
                      <UserCog className="w-3 h-3 mr-1" /> Editar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* DESKTOP VIEW */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className={!user.activo ? "opacity-60 bg-muted/30" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={user.avatar_url} />
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
                {filteredUsers.length === 0 && !loading && (
                    <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      No se encontraron usuarios.
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                    <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                            Cargando...
                        </TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <EditUserModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        userToEdit={selectedUser}
        onSuccess={fetchUsers}
      />

      <CreateUserModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={fetchUsers}
      />
    </div>
  );
}