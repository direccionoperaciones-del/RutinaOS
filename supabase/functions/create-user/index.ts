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
        return new Response(JSON.stringify({ error: 'Solo los directores pueden crear usuarios.' }), { status: 403, headers: corsHeaders })
    }

    // 2. Obtener datos del body
    const { email, password, nombre, apellido, role } = await req.json()

    if (!email || !password || !nombre || !apellido || !role) {
        return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), { status: 400, headers: corsHeaders })
    }

    // 3. Crear el usuario en Auth
    // Pasamos el tenant_id en los metadatos para que el Trigger de la base de datos
    // se encargue de crear el perfil automáticamente vinculado a esta organización.
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirmar email
        user_metadata: {
            nombre: nombre,
            apellido: apellido,
            tenant_id: requesterProfile.tenant_id, // VINCULACIÓN CRÍTICA
            role: role // Opcional, el trigger podría usar esto o el update posterior
        }
    })

    if (createError) throw createError

    // 4. Asegurar que el perfil tenga el rol correcto (por si el trigger por defecto asigna otro)
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
    console.error("Error creating user:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})