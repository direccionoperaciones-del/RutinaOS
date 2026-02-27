import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, CheckCircle2, AlertTriangle, Lock, Building, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const registerSchema = z.object({
  nombre: z.string().min(2, "Mínimo 2 caracteres"),
  apellido: z.string().min(2, "Mínimo 2 caracteres"),
  tenant_name: z.string().min(3, "Nombre de empresa requerido"),
  // Email es read-only porque viene de Wompi, pero lo validamos igual
  email: z.string().email("Email inválido"), 
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

export default function RegisterComplete() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const transactionId = searchParams.get("id");
  
  const [status, setStatus] = useState<'validating' | 'approved' | 'pending' | 'error'>('validating');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formulario
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { nombre: "", apellido: "", tenant_name: "", email: "", password: "" }
  });

  // Polling para verificar transacción y obtener email seguro
  useEffect(() => {
    if (!transactionId) {
      setStatus('error');
      return;
    }

    let attempts = 0;
    const maxAttempts = 20;

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('verify-transaction', {
          body: { id: transactionId }
        });

        if (error) throw error;

        if (data.status === 'APPROVED') {
          setStatus('approved');
          setPaymentData(data);
          
          // Pre-llenar el email si Wompi lo devuelve (mejora UX y seguridad)
          // Nota: verify-transaction debería devolver el email si es posible, 
          // si no, el usuario lo escribe y la Edge Function valida que coincida.
          return true;
        } else if (data.status === 'DECLINED' || data.status === 'VOIDED' || data.status === 'ERROR') {
          setStatus('error');
          toast({ variant: "destructive", title: "Pago rechazado", description: "La transacción no fue aprobada." });
          return true;
        }
        return false; 

      } catch (err) {
        console.error(err);
        return false;
      }
    };

    const interval = setInterval(async () => {
      attempts++;
      const stop = await verify();
      
      if (stop) {
        clearInterval(interval);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        setStatus('error');
        toast({ variant: "destructive", title: "Tiempo agotado", description: "No pudimos confirmar el pago automáticamente." });
      }
    }, 3000);

    verify();

    return () => clearInterval(interval);
  }, [transactionId]);

  const onRegister = async (values: z.infer<typeof registerSchema>) => {
    setIsSubmitting(true);
    try {
      // LLAMADA A LA NUEVA EDGE FUNCTION (Bypass Email Confirm)
      const { data, error } = await supabase.functions.invoke('register-with-payment', {
        body: {
          transactionId: transactionId,
          companyName: values.tenant_name,
          password: values.password,
          nombre: values.nombre,
          apellido: values.apellido,
          // Nota: El email se toma directo de Wompi en el backend por seguridad,
          // o se valida que coincida con el input.
        }
      });

      if (error) {
        // Intentar parsear error
        let msg = error.message;
        try {
            const errBody = JSON.parse(error.message);
            if (errBody.error) msg = errBody.error;
        } catch(e) {}
        throw new Error(msg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({ 
        title: "¡Cuenta Activada!", 
        description: "Bienvenido a RunOp. Iniciando sesión...",
        duration: 4000 
      });

      // Auto-login inmediato para mejorar UX
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: data.email, // Email retornado por la función (el real de Wompi)
        password: values.password
      });

      if (!loginError) {
        navigate("/"); // Ir al dashboard
      } else {
        navigate("/login"); // Si falla el autologin, ir al login manual
      }

    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error al activar", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'validating' || status === 'pending') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md text-center py-10">
          <CardContent>
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-2">Confirmando Pago...</h2>
            <p className="text-muted-foreground">Estamos comunicándonos con el banco.<br/>Por favor no cierres esta ventana.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md text-center py-10 border-red-200 bg-red-50">
          <CardContent>
            <AlertTriangle className="w-16 h-16 text-red-600 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-red-900 mb-2">No pudimos verificar el pago</h2>
            <p className="text-red-700 mb-6">La transacción fue rechazada o expiró.</p>
            <Button onClick={() => navigate('/login')} variant="outline" className="border-red-200 text-red-900 hover:bg-red-100">
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-[500px] shadow-xl border-t-4 border-t-green-500 animate-in fade-in zoom-in duration-300">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto bg-green-100 p-3 rounded-full w-fit mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">¡Pago Exitoso!</CardTitle>
          <CardDescription className="text-base text-green-700 font-medium">
            Tu plan <strong>{paymentData?.plan?.toUpperCase()}</strong> está listo. <br/>
            Completa tus datos para activar la cuenta.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onRegister)} className="space-y-4">
              <FormField
                control={form.control}
                name="tenant_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de tu Empresa</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Mi Negocio S.A.S" className="pl-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="apellido"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apellido</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* El email en este punto es visual si no se rellena, pero la función usa el de Wompi */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Corporativo</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Debe coincidir con el pago" className="pl-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Crear Contraseña</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input type="password" placeholder="******" className="pl-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full h-11 text-lg font-bold bg-green-600 hover:bg-green-700 mt-4" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Activar Cuenta"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="justify-center py-4 bg-muted/20 text-xs text-muted-foreground">
          ID Transacción: {transactionId}
        </CardFooter>
      </Card>
    </div>
  );
}