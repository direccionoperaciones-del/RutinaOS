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
    
    // Validamos el usuario
    const { data: { user: requestUser }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !requestUser) {
        return new Response(
            JSON.stringify({ error: 'Sesión inválida o expirada.' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // 4. Verificar Permisos (Director o Superadmin)
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

    const isDirector = requesterProfile.role === 'director';
    const isSuperAdmin = requesterProfile.role === 'superadmin';

    if (!isDirector && !isSuperAdmin) {
        return new Response(
            JSON.stringify({ error: 'Permiso denegado. Solo directores y superadmins pueden crear usuarios.' }), 
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // 5. Leer Datos del Body
    let body;
    try {
        body = await req.json();
    } catch (e) {
        return new Response(
            JSON.stringify({ error: 'Cuerpo de la petición inválido.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    const { email, password, nombre, apellido, role, tenant_id } = body

    if (!email || !password || !nombre || !apellido || !role) {
        return new Response(
            JSON.stringify({ error: 'Faltan campos obligatorios.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // Lógica para determinar el Tenant ID del nuevo usuario
    let finalTenantId = requesterProfile.tenant_id;

    if (isSuperAdmin) {
        // Si es superadmin, DEBE venir el tenant_id en el body (del selector God Mode)
        if (!tenant_id) {
             return new Response(
                JSON.stringify({ error: 'Superadmin: Se requiere tenant_id destino.' }), 
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }
        finalTenantId = tenant_id;
    } 
    // Si es Director, ignoramos body.tenant_id por seguridad y usamos el suyo propio.

    // 6. Crear Usuario (Admin API)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
            nombre: nombre,
            apellido: apellido,
            tenant_id: finalTenantId,
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
            JSON.stringify({ error: 'No se pudo crear el usuario.' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }

    // 7. Asegurar Perfil
    const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .upsert({ 
            id: newUser.user.id,
            tenant_id: finalTenantId,
            email: email,
            nombre: nombre,
            apellido: apellido,
            role: role,
            activo: true
        })
    
    if (profileUpdateError) {
        console.error("Error updating profile manually:", profileUpdateError)
    }

    // 8. Éxito
    return new Response(
      JSON.stringify({ success: true, user: newUser.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Critical error in create-user:", error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno del servidor.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})