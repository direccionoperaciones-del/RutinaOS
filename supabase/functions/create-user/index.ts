import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    // Cliente Admin (Service Role) para poder crear usuarios
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Verificar quien hace la petición (Seguridad)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    // Obtenemos el usuario que llama a la función usando el token del cliente
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: requestUser }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !requestUser) throw new Error('Unauthorized')

    // Verificar que el solicitante sea Director
    const { data: requesterProfile } = await supabaseAdmin
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', requestUser.id)
        .single()

    if (requesterProfile?.role !== 'director') {
        return new Response(JSON.stringify({ error: 'Solo los directores pueden crear usuarios.' }), { status: 200, headers: corsHeaders })
    }

    // 2. Obtener datos del body
    const { email, password, nombre, apellido, role } = await req.json()

    if (!email || !password || !nombre || !apellido || !role) {
        return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), { status: 200, headers: corsHeaders })
    }

    // 3. Crear el usuario en Auth
    // Cambiamos email_confirm a FALSE para que Supabase envíe el correo de confirmación
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: false, // IMPORTANTE: False para disparar el envío de email
        user_metadata: {
            nombre: nombre,
            apellido: apellido,
            tenant_id: requesterProfile.tenant_id,
            role: role 
        }
    })

    if (createError) {
        console.error("Error creating user in Auth:", createError)
        return new Response(
            JSON.stringify({ error: createError.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }

    // 4. Asegurar que el perfil tenga el rol correcto
    if (newUser.user) {
        await supabaseAdmin
            .from('profiles')
            .update({ role: role })
            .eq('id', newUser.user.id)
    }

    return new Response(
      JSON.stringify({ success: true, user: newUser.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Critical error in create-user:", error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno del servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})