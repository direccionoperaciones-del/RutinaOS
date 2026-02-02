import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Manejo de Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Configuración del servidor incompleta (Faltan variables de entorno).')
    }

    // 2. Cliente Admin (Service Role) - Poder total
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 3. Obtener y Validar Token del Usuario
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return new Response(
            JSON.stringify({ error: 'Falta cabecera de autorización' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    // Validamos el usuario usando el cliente admin (esto verifica que el token sea válido y real)
    const { data: { user: requestUser }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !requestUser) {
        return new Response(
            JSON.stringify({ error: 'Sesión inválida o expirada.' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // 4. Verificar Permisos (Debe ser Director)
    const { data: requesterProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', requestUser.id)
        .single()

    if (profileError || !requesterProfile) {
        return new Response(
            JSON.stringify({ error: 'No se pudo verificar tu perfil de usuario.' }), 
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    if (requesterProfile.role !== 'director') {
        return new Response(
            JSON.stringify({ error: 'Permiso denegado. Solo los directores pueden crear usuarios.' }), 
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // 5. Leer Datos del Body
    let body;
    try {
        body = await req.json();
    } catch (e) {
        return new Response(
            JSON.stringify({ error: 'Cuerpo de la petición inválido (JSON malformado).' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    const { email, password, nombre, apellido, role } = body

    if (!email || !password || !nombre || !apellido || !role) {
        return new Response(
            JSON.stringify({ error: 'Faltan campos obligatorios (email, password, nombre, apellido, role).' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // 6. Crear Usuario (Admin API)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirmar
        user_metadata: {
            nombre: nombre,
            apellido: apellido,
            tenant_id: requesterProfile.tenant_id,
            role: role 
        }
    })

    if (createError) {
        console.error("Error creating user:", createError)
        return new Response(
            JSON.stringify({ error: `Error creando usuario: ${createError.message}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }

    if (!newUser.user) {
         return new Response(
            JSON.stringify({ error: 'No se pudo crear el usuario (Respuesta vacía).' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }

    // 7. Asegurar Perfil (Backup manual)
    // Aunque haya trigger, forzamos la creación/actualización para asegurar consistencia inmediata
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
        // No retornamos error aquí para no bloquear el flujo si el usuario ya se creó en Auth
    }

    // 8. Éxito
    return new Response(
      JSON.stringify({ success: true, user: newUser.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Critical error in create-user:", error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno del servidor no controlado.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})