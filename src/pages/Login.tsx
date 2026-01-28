import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

// Schema para Login
const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Form Login
  const formLogin = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onLogin = async (values: z.infer<typeof loginSchema>) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (error) throw new Error(error.message === "Invalid login credentials" ? "Credenciales incorrectas" : error.message);
      if (!data.user) throw new Error("No se pudo iniciar sesión");

      // Validar estado del perfil
      const { data: profile } = await supabase
        .from('profiles')
        .select('activo')
        .eq('id', data.user.id)
        .single();

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-8">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-primary">
        <CardHeader className="text-center pb-6">
          <div className="w-24 h-24 mx-auto mb-4 overflow-hidden">
            <img 
              src="https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg" 
              alt="Movacheck Logo" 
              className="w-full h-full object-contain rounded-full"
            />
          </div>
          <CardTitle className="text-2xl font-bold">Movacheck</CardTitle>
          <CardDescription>Plataforma de Rutinas Operativas</CardDescription>
        </CardHeader>
        
        <CardContent>
          <Form {...formLogin}>
            <form onSubmit={formLogin.handleSubmit(onLogin)} className="space-y-4">
              <FormField
                control={formLogin.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="usuario@empresa.com" className="pl-9" {...field} />
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
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input type="password" placeholder="••••••••" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Checkbox id="remember" />
                  <label htmlFor="remember" className="font-medium cursor-pointer">Recordarme</label>
                </div>
                <a href="#" className="font-medium text-primary hover:underline">¿Olvidaste tu contraseña?</a>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Ingresar"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="justify-center text-xs text-muted-foreground pb-6">
          Acceso restringido a personal autorizado.
        </CardFooter>
      </Card>
    </div>
  );
};

export default Login;