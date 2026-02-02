import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, Mail, User, Building, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// --- SCHEMAS ---
const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

const registerSchema = z.object({
  nombre: z.string().min(2, "Nombre requerido"),
  apellido: z.string().min(2, "Apellido requerido"),
  tenant_name: z.string().min(3, "Nombre de empresa requerido"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const formLogin = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const formRegister = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { nombre: "", apellido: "", tenant_name: "", email: "", password: "" },
  });

  // --- HANDLERS (Same Logic) ---
  const onLogin = async (values: z.infer<typeof loginSchema>) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (error) throw new Error(error.message === "Invalid login credentials" ? "Credenciales incorrectas" : error.message);
      if (!data.user) throw new Error("No se pudo iniciar sesión");

      const { data: profile } = await supabase
        .from('profiles')
        .select('activo')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile && !profile.activo) {
        await supabase.auth.signOut();
        throw new Error("Usuario inactivo. Contacte soporte.");
      }

      toast({ title: "Bienvenido", description: "Sesión iniciada correctamente." });
      navigate("/");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const onRegister = async (values: z.infer<typeof registerSchema>) => {
    setIsLoading(true);
    try {
      const redirectTo = `${window.location.origin}/login`;
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            nombre: values.nombre,
            apellido: values.apellido,
            tenant_name: values.tenant_name, 
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        toast({ 
          title: "Cuenta Creada", 
          description: "Revisa tu correo para confirmar tu cuenta antes de ingresar.",
          duration: 6000 
        });
        setIsRegisterOpen(false);
        formRegister.reset();
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al registrar", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const onResetPassword = async () => {
    if (!resetEmail) {
      toast({ variant: "destructive", title: "Requerido", description: "Ingresa tu email." });
      return;
    }
    setIsResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/settings`,
      });
      if (error) throw error;
      toast({ title: "Correo enviado", description: "Revisa tu bandeja de entrada." });
      setIsResetOpen(false);
      setResetEmail("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      
      <Card className="w-full max-w-[420px] shadow-xl border-t-4 border-t-primary animate-in fade-in-50 zoom-in-95 duration-300 z-10">
        <CardHeader className="text-center pb-8 pt-8">
          <div className="w-16 h-16 mx-auto mb-6 overflow-hidden rounded-xl shadow-sm border bg-white p-2 flex items-center justify-center">
            <img 
              src="https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg" 
              alt="Movacheck" 
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Bienvenido</CardTitle>
          <CardDescription className="text-base">Inicia sesión para gestionar tus operaciones</CardDescription>
        </CardHeader>
        
        <CardContent className="px-8 pb-8">
          <Form {...formLogin}>
            <form onSubmit={formLogin.handleSubmit(onLogin)} className="space-y-5">
              <FormField
                control={formLogin.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground/80">Email Corporativo</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="usuario@empresa.com" className="pl-10 h-11" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={formLogin.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-foreground/80">Contraseña</FormLabel>
                      <span 
                        className="text-xs font-medium text-primary hover:text-primary/80 cursor-pointer hover:underline"
                        onClick={() => setIsResetOpen(true)}
                      >
                        ¿Olvidaste tu contraseña?
                      </span>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          type={showLoginPassword ? "text" : "password"} 
                          placeholder="••••••••" 
                          className="pl-10 pr-10 h-11" 
                          {...field} 
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                          tabIndex={-1}
                        >
                          {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button type="submit" className="w-full h-11 text-base font-semibold shadow-md" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Iniciar Sesión"}
              </Button>
            </form>
          </Form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground font-medium">O</span>
            </div>
          </div>

          <Button 
            variant="outline" 
            className="w-full h-11 border-dashed border-2 hover:bg-muted/50 hover:border-primary/50 text-muted-foreground hover:text-foreground" 
            onClick={() => setIsRegisterOpen(true)}
          >
            Registrar nueva empresa
          </Button>

        </CardContent>
        <CardFooter className="justify-center py-6 bg-muted/20 border-t">
          <p className="text-xs text-muted-foreground text-center">
            © 2026 Movacheck. Todos los derechos reservados.
          </p>
        </CardFooter>
      </Card>

      {/* --- MODAL DE RECUPERACIÓN --- */}
      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Recuperar Contraseña</DialogTitle>
            <DialogDescription>
              Ingresa tu correo y te enviaremos un enlace para restablecer tu acceso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input 
                placeholder="ejemplo@empresa.com" 
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetOpen(false)}>Cancelar</Button>
            <Button onClick={onResetPassword} disabled={isResetting}>
              {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar Enlace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- MODAL DE REGISTRO --- */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Crear Cuenta Corporativa</DialogTitle>
            <DialogDescription>
              Registra tu organización. Tú serás el usuario <strong>Director</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...formRegister}>
            <form onSubmit={formRegister.handleSubmit(onRegister)} className="space-y-4 py-2">
              <FormField
                control={formRegister.control}
                name="tenant_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la Empresa</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Mi Empresa S.A.S" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={formRegister.control}
                  name="nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl><Input placeholder="Juan" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={formRegister.control}
                  name="apellido"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apellido</FormLabel>
                      <FormControl><Input placeholder="Pérez" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={formRegister.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="admin@miempresa.com" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={formRegister.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          type={showRegisterPassword ? "text" : "password"} 
                          placeholder="******" 
                          className="pl-9 pr-10" 
                          {...field} 
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                          tabIndex={-1}
                        >
                          {showRegisterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="mt-4">
                <Button type="button" variant="ghost" onClick={() => setIsRegisterOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <span className="flex items-center">Registrar <ArrowRight className="ml-2 h-4 w-4"/></span>}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;