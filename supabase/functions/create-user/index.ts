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
    
    // 6. LÓGICA MEJORADA: Crear o Actualizar usuario
    // FIX: Reemplazo de getUserByEmail que no existe
    let finalUser;
    let targetUserId;

    // A. Buscar en tabla profiles primero (más eficiente para saber ID si ya existe en el sistema)
    const { data: profileData } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

    if (profileData) {
        targetUserId = profileData.id;
    }

    // B. Si no está en perfiles, intentamos crearlo
    if (!targetUserId) {
        console.log(`[create-user] Intentando crear usuario ${email}...`);
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true, // Auto-confirmar
            user_metadata: { nombre, apellido, tenant_id: finalTenantId, role }
        });

        if (createError) {
            // C. Si falla porque ya existe en Auth (pero no tenía perfil), buscamos su ID
            // Esto sucede si hubo un registro fallido anterior o importación manual
            if (createError.message?.toLowerCase().includes("already registered") || createError.status === 422) {
                console.log("[create-user] Usuario existe en Auth. Buscando ID...");
                
                // listUsers trae paginado (default 50). Pedimos más para asegurar encontrarlo en tenant pequeños/medianos.
                // En un sistema masivo esto debería optimizarse, pero Auth API no tiene búsqueda por email directa expuesta en esta versión del cliente.
                const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
                
                if (listError) throw listError;
                
                const existingAuthUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
                if (existingAuthUser) {
                    targetUserId = existingAuthUser.id;
                } else {
                    throw new Error(`El correo ${email} está registrado en el sistema pero no se pudo recuperar para actualizar.`);
                }
            } else {
                throw new Error(`Error creando usuario: ${createError.message}`);
            }
        } else {
            finalUser = newUser.user;
        }
    }

    // D. Si encontramos un ID existente (targetUserId), actualizamos sus datos
    if (targetUserId) {
        console.log(`[create-user] Actualizando usuario existente ${targetUserId}...`);
        const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            targetUserId,
            {
                password: password,
                user_metadata: { nombre, apellido, tenant_id: finalTenantId, role },
                email_confirm: true
            }
        );
        if (updateError) throw new Error(`Error actualizando usuario existente: ${updateError.message}`);
        finalUser = updatedUser.user;
    }

    if (!finalUser) throw new Error('No se pudo procesar la creación/actualización del usuario.');

    // 7. Asegurar que el perfil exista y esté correcto (UPSERT)
    console.log(`[create-user] Sincronizando perfil para ${finalUser.id}`);
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
        console.error("Error en upsert de perfil:", profileUpsertError);
        // No bloqueamos la respuesta exitosa del auth user, pero logueamos el error.
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