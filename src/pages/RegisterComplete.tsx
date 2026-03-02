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
import { Loader2, CheckCircle2, AlertTriangle, Lock, Building, User, ArrowRight } from "lucide-react";
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
  
  const [status, setStatus] = useState<'validating' | 'approved' | 'standard' | 'error'>(transactionId ? 'validating' : 'standard');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { nombre: "", apellido: "", tenant_name: "", email: "", password: "" }
  });

  useEffect(() => {
    if (!transactionId) {
      setStatus('standard');
      return;
    }

    let attempts = 0;
    const maxAttempts = 15;

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('verify-transaction', {
          body: { id: transactionId }
        });
        if (error) throw error;

        if (data.status === 'APPROVED') {
          setStatus('approved');
          return true;
        } else if (['DECLINED', 'VOIDED', 'ERROR'].includes(data.status)) {
          setStatus('error');
          return true;
        }
        return false; 
      } catch (err) {
        return false;
      }
    };

    const interval = setInterval(async () => {
      attempts++;
      if (await verify() || attempts >= maxAttempts) clearInterval(interval);
      if (attempts >= maxAttempts && status === 'validating') setStatus('error');
    }, 3000);

    verify();
    return () => clearInterval(interval);
  }, [transactionId, status]);

  const onRegisterPayment = async (values: z.infer<typeof registerSchema>) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('register-with-payment', {
        body: { transactionId, companyName: values.tenant_name, password: values.password, nombre: values.nombre, apellido: values.apellido }
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);

      toast({ title: "¡Cuenta Activada!", description: "Iniciando sesión..." });
      await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
      navigate("/");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'standard') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4 text-center">
        <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
          <CardHeader>
            <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-4">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">¡Email Confirmado!</CardTitle>
            <CardDescription>Tu cuenta ha sido verificada con éxito. Ya puedes ingresar a la plataforma.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full h-11 text-base font-bold" onClick={() => navigate('/login')}>
              Ir al Inicio de Sesión <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (status === 'validating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md text-center py-12">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-bold">Verificando pago...</h2>
          <p className="text-muted-foreground mt-2">No cierres esta ventana.</p>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md text-center py-10 border-red-200 bg-red-50">
          <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-900">Pago no confirmado</h2>
          <p className="text-red-700 mb-6 px-6">La transacción no pudo ser verificada. Si el dinero fue descontado, contacta a soporte.</p>
          <Button onClick={() => navigate('/login')} variant="outline" className="border-red-200 text-red-900">Volver al Inicio</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-[500px] shadow-xl border-t-4 border-t-green-500">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto bg-green-100 p-3 rounded-full w-fit mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold">¡Pago Exitoso!</CardTitle>
          <CardDescription className="text-green-700 font-medium">Completa tus datos para activar tu empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onRegisterPayment)} className="space-y-4">
              <FormField control={form.control} name="tenant_name" render={({ field }) => (
                <FormItem><FormLabel>Nombre de la Empresa</FormLabel><FormControl><div className="relative"><Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input placeholder="Mi Negocio S.A.S" className="pl-10" {...field}/></div></FormControl><FormMessage/></FormItem>
              )}/>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="nombre" render={({ field }) => (
                  <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field}/></FormControl><FormMessage/></FormItem>
                )}/>
                <FormField control={form.control} name="apellido" render={({ field }) => (
                  <FormItem><FormLabel>Apellido</FormLabel><FormControl><Input {...field}/></FormControl><FormMessage/></FormItem>
                )}/>
              </div>
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email Corporativo</FormLabel><FormControl><div className="relative"><User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input placeholder="Debe coincidir con el pago" className="pl-10" {...field}/></div></FormControl><FormMessage/></FormItem>
              )}/>
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem><FormLabel>Crear Contraseña</FormLabel><FormControl><div className="relative"><Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input type="password" placeholder="******" className="pl-10" {...field}/></div></FormControl><FormMessage/></FormItem>
              )}/>
              <Button type="submit" className="w-full h-11 text-lg font-bold bg-green-600 hover:bg-green-700 mt-4" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : "Activar Cuenta"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}