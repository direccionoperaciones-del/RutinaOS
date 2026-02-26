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

  // Polling para verificar transacción
  useEffect(() => {
    if (!transactionId) {
      setStatus('error');
      return;
    }

    let attempts = 0;
    const maxAttempts = 20; // 1 minuto aprox (3s * 20)

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('verify-transaction', {
          body: { id: transactionId }
        });

        if (error) throw error;

        if (data.status === 'APPROVED') {
          setStatus('approved');
          setPaymentData(data);
          return true; // Stop polling
        } else if (data.status === 'DECLINED' || data.status === 'VOIDED' || data.status === 'ERROR') {
          setStatus('error');
          toast({ variant: "destructive", title: "Pago rechazado", description: "La transacción no fue aprobada por el banco." });
          return true;
        }
        
        // Sigue en PENDING
        return false; 

      } catch (err) {
        console.error(err);
        // No marcamos error fatal inmediatamente en polling, reintentamos
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
        setStatus('error'); // Timeout
        toast({ variant: "destructive", title: "Tiempo de espera agotado", description: "No pudimos confirmar el pago automáticamente. Contacta soporte." });
      }
    }, 3000); // Cada 3 segundos

    // Primer chequeo inmediato
    verify();

    return () => clearInterval(interval);
  }, [transactionId]);

  const onRegister = async (values: z.infer<typeof registerSchema>) => {
    setIsSubmitting(true);
    try {
      const redirectTo = `${window.location.origin}/login`;
      
      // Enviamos la referencia de pago en metadata. 
      // El trigger de base de datos interceptará esto para asignar el plan.
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            nombre: values.nombre,
            apellido: values.apellido,
            tenant_name: values.tenant_name,
            wompi_reference: paymentData?.reference, // <--- LA CLAVE PARA VINCULAR PAGO
            wompi_transaction_id: transactionId
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        toast({ 
          title: "¡Cuenta Activada!", 
          description: "Revisa tu correo para confirmar. Tu plan Pro ya está reservado.",
          duration: 6000 
        });
        navigate("/login");
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al registrar", description: error.message });
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
            <Button onClick={() => window.location.href = 'https://tu-landing.com'} variant="outline" className="border-red-200 text-red-900 hover:bg-red-100">
              Volver a intentar
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

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Corporativo</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="admin@empresa.com" className="pl-10" {...field} />
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