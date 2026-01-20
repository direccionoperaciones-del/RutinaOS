import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, CalendarOff, UserCog, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AbsenceModal } from "./AbsenceModal";

export default function PersonnelPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [absences, setAbsences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | undefined>(undefined);

  const fetchData = async () => {
    setLoading(true);
    // 1. Usuarios
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

  const handleAddAbsence = (userId?: string) => {
    setSelectedUser(userId);
    setIsAbsenceModalOpen(true);
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
        <Button onClick={() => handleAddAbsence()}>
          <CalendarOff className="w-4 h-4 mr-2" /> Registrar Novedad
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Columna Izquierda: Lista de Usuarios */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Equipo de Trabajo</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuario..."
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
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{user.nombre?.[0]}{user.apellido?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{user.nombre} {user.apellido}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                       <div className={`w-2 h-2 rounded-full ${user.activo ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleAddAbsence(user.id)} title="Programar Ausencia">
                        <CalendarOff className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Columna Derecha: Ausencias Vigentes */}
        <Card>
          <CardHeader>
            <CardTitle>Ausencias Programadas</CardTitle>
            <CardDescription>Próximas o en curso</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {absences.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No hay ausencias activas.</p>
              ) : (
                absences.map(abs => (
                  <div key={abs.id} className="p-3 border rounded-md bg-muted/20 text-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold">{abs.profiles?.nombre} {abs.profiles?.apellido}</span>
                      <Badge variant="secondary" className="text-[10px]">{abs.absence_types?.nombre}</Badge>
                    </div>
                    <div className="text-muted-foreground mb-2">
                      {format(new Date(abs.fecha_desde), "dd MMM", { locale: es })} - {format(new Date(abs.fecha_hasta), "dd MMM", { locale: es })}
                    </div>
                    {abs.politica === 'reasignar' ? (
                       <div className="text-xs flex items-center gap-1 text-blue-600 bg-blue-50 p-1 rounded">
                         <UserCog className="w-3 h-3" /> Reemplazo: {abs.receptor?.nombre} {abs.receptor?.apellido}
                       </div>
                    ) : (
                      <div className="text-xs flex items-center gap-1 text-gray-500 bg-gray-100 p-1 rounded">
                         <CalendarOff className="w-3 h-3" /> Tareas Omitidas
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
        preselectedUserId={selectedUser}
      />
    </div>
  );
}