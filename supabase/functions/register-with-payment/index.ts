import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// 1. CABECERAS CORS (CRÍTICO: Permitir todo origen y métodos)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', 
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  // 2. MANEJO DE PREFLIGHT (El "timbre" del navegador)
  // Si el método es OPTIONS, respondemos OK inmediatamente y terminamos.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 3. VALIDAR MÉTODO
    if (req.method !== 'POST') {
        throw new Error('Method not allowed');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Recibir datos
    const { transactionId, companyName, password, nombre, apellido } = await req.json()

    if (!transactionId || !password || !companyName) {
      throw new Error('Faltan datos obligatorios (Transaction ID, Contraseña o Empresa)')
    }

    // --- VERIFICACIÓN WOMPI ---
    const wompiRes = await fetch(`https://production.wompi.co/v1/transactions/${transactionId}`)
    
    if (!wompiRes.ok) throw new Error('Error conectando con Wompi')

    const wompiData = await wompiRes.json()
    const transaction = wompiData.data

    if (transaction.status !== 'APPROVED') {
       throw new Error(`La transacción no está aprobada. Estado: ${transaction.status}`)
    }

    const payerEmail = transaction.customer_email
    const reference = transaction.reference 

    // --- CREACIÓN DE USUARIO (BYPASS) ---
    const { data: user, error: createError } = await supabase.auth.admin.createUser({
      email: payerEmail,
      password: password,
      email_confirm: true, // Magia: Usuario nace confirmado
      user_metadata: { 
        nombre: nombre || transaction.customer_data?.full_name?.split(' ')[0] || 'Usuario',
        apellido: apellido || '',
        tenant_name: companyName,       
        wompi_reference: reference,     
        wompi_transaction_id: transactionId
      }
    })

    if (createError) {
        // Manejo amigable si ya existe
        if (createError.message?.includes('already registered')) {
            throw new Error('Este correo ya tiene una cuenta registrada en RunOp.')
        }
        throw createError
    }

    // RESPUESTA EXITOSA (Con CORS headers)
    return new Response(JSON.stringify({ 
      success: true, 
      user: user,
      message: "Cuenta activada correctamente"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("Error en register-with-payment:", error)
    
    // RESPUESTA DE ERROR (CRÍTICO: TAMBIÉN DEBE LLEVAR CORS HEADERS)
    // Si no ponemos headers aquí, el navegador oculta el error real y muestra "CORS Error"
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})