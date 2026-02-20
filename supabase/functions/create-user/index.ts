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

    // 6. LÓGICA MEJORADA: Buscar si el usuario ya existe
    const { data: existingUserData } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    let finalUser;

    if (existingUserData && existingUserData.user) {
        // Usuario existe: Actualizar contraseña y metadatos
        console.log(`[create-user] User ${email} exists. Updating password and metadata.`);
        const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existingUserData.user.id,
            {
                password: password,
                user_metadata: { nombre, apellido, tenant_id: finalTenantId, role }
            }
        );
        if (updateError) throw new Error(`Error actualizando usuario existente: ${updateError.message}`);
        finalUser = updatedUser.user;
    } else {
        // Usuario no existe: Crear nuevo
        console.log(`[create-user] User ${email} does not exist. Creating new user.`);
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true, // Auto-confirmar ya que es una acción de admin
            user_metadata: { nombre, apellido, tenant_id: finalTenantId, role }
        });
        if (createError) throw new Error(`Error creando usuario: ${createError.message}`);
        finalUser = newUser.user;
    }

    if (!finalUser) throw new Error('No se pudo crear o actualizar el usuario.');

    // 7. Asegurar que el perfil exista y esté correcto (UPSERT)
    console.log(`[create-user] Upserting profile for user ${finalUser.id}`);
    const { error: profileUpsertError } = await supabaseAdmin
        .from('profiles')
        .upsert({ 
            id: finalUser.id,
            tenant_id: finalTenantId,
            email: email,
            nombre: nombre,
            apellido: apellido,
            role: role,
            activo: true
        });

    if (profileUpsertError) {
        // No lanzar error, solo loguear. La creación del usuario de auth es lo más importante.
        console.error("Error en upsert de perfil (no crítico):", profileUpsertError);
    }

    // 8. Éxito
    return new Response(
      JSON.stringify({ success: true, user: finalUser }),
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