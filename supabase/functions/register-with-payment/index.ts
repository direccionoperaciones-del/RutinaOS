import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Inicializar cliente con permisos de ADMIN (Service Role)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Recibir datos del frontend
    const { transactionId, companyName, password, nombre, apellido } = await req.json()

    // Validaciones básicas
    if (!transactionId || !password || !companyName) {
      throw new Error('Faltan datos obligatorios (Transaction ID, Contraseña o Empresa)')
    }

    // 1. VERIFICAR TRANSACCIÓN EN WOMPI
    // Consultamos directamente a Wompi para asegurar que el ID es real y obtener el email del pagador
    const wompiRes = await fetch(`https://production.wompi.co/v1/transactions/${transactionId}`)
    
    if (!wompiRes.ok) {
        throw new Error('Error conectando con Wompi')
    }

    const wompiData = await wompiRes.json()
    const transaction = wompiData.data

    // Seguridad: Solo procesar si está APROBADA
    if (transaction.status !== 'APPROVED') {
       throw new Error(`La transacción no es válida (Estado: ${transaction.status})`)
    }

    const payerEmail = transaction.customer_email
    const reference = transaction.reference // Esto es vital para vincular el plan (ej: new_123...)

    // 2. CREAR USUARIO CONFIRMADO (Admin API)
    // Usamos admin.createUser para bypass de confirmación de email
    const { data: user, error: createError } = await supabase.auth.admin.createUser({
      email: payerEmail,
      password: password,
      email_confirm: true, // <--- ESTO EVITA EL ENVÍO DEL EMAIL
      user_metadata: { 
        // Datos Personales
        nombre: nombre || transaction.customer_data?.full_name || 'Usuario',
        apellido: apellido || '',
        
        // --- VARIABLES PARA TU TRIGGER SQL ---
        // Tu DB espera 'tenant_name' para crear la empresa
        tenant_name: companyName,
        // Tu DB espera 'wompi_reference' para saber que es Plan Pro/Elite
        wompi_reference: reference, 
        // Guardamos el ID de transacción por auditoría
        wompi_transaction_id: transactionId
      }
    })

    if (createError) {
        // Manejo de error si el usuario ya existe
        if (createError.message?.includes('already registered')) {
            throw new Error('Este correo ya está registrado en el sistema.')
        }
        throw createError
    }

    // 3. RESPUESTA EXITOSA
    return new Response(JSON.stringify({ 
      success: true, 
      userId: user.user.id,
      email: payerEmail,
      message: "Cuenta creada y activada correctamente"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("Error en register-with-payment:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})