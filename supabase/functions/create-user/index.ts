import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    
    // Cliente Admin para operaciones de alto nivel (crear usuario)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. VERIFICACIÓN DE SEGURIDAD (Quién llama)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Falta cabecera de autorización' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    
    // Usamos el cliente anónimo para verificar el token del usuario que llama
    const token = authHeader.replace('Bearer ', '')
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
    
    const { data: { user: requestUser }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !requestUser) {
        console.error("Error verificando usuario:", userError)
        return new Response(JSON.stringify({ error: 'Sesión inválida o expirada. Por favor recarga la página e intenta de nuevo.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Verificar que el solicitante sea Director consultando su perfil
    const { data: requesterProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', requestUser.id)
        .single()

    if (profileError || !requesterProfile) {
        return new Response(JSON.stringify({ error: 'No se pudo verificar el perfil del solicitante.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (requesterProfile.role !== 'director') {
        return new Response(JSON.stringify({ error: 'Permiso denegado. Solo los directores pueden crear usuarios.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. OBTENER DATOS
    const { email, password, nombre, apellido, role } = await req.json()

    if (!email || !password || !nombre || !apellido || !role) {
        return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. CREAR USUARIO (Admin API)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirmar para acceso inmediato
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
            JSON.stringify({ error: `Error creando usuario: ${createError.message}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }

    // 4. ASEGURAR PERFIL (Backup manual por si el trigger falla)
    if (newUser.user) {
        const { error: profileUpdateError } = await supabaseAdmin
            .from('profiles')
            .upsert({ 
                id: newUser.user.id,
                tenant_id: requesterProfile.tenant_id,
                email: email,
                nombre: nombre,
                apellido: apellido,
                role: role,
                activo: true
            })
        
        if (profileUpdateError) {
            console.error("Error updating profile manually:", profileUpdateError)
        }
    }

    return new Response(
      JSON.stringify({ success: true, user: newUser.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Critical error in create-user:", error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno del servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})