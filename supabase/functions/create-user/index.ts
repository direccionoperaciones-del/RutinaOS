import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Configuración del servidor incompleta.')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return new Response(
            JSON.stringify({ error: 'Falta cabecera de autorización' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    const { data: { user: requestUser }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !requestUser) {
        return new Response(
            JSON.stringify({ error: 'Sesión inválida o expirada.' }), 
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

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
            JSON.stringify({ error: 'Permiso denegado.' }), 
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

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

    let finalTenantId = requesterProfile.tenant_id;

    if (isSuperAdmin) {
        if (!tenant_id) {
             return new Response(
                JSON.stringify({ error: 'Superadmin: Se requiere tenant_id destino.' }), 
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }
        finalTenantId = tenant_id;
    } 
    
    let finalUser;
    let targetUserId;

    // 1. Buscar en perfiles
    const { data: profileData } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

    if (profileData) {
        targetUserId = profileData.id;
    }

    // 2. Si no existe perfil, intentar crear usuario
    if (!targetUserId) {
        console.log(`[create-user] Creando usuario ${email}...`);
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: { nombre, apellido, tenant_id: finalTenantId, role }
        });

        if (createError) {
            // Manejo de usuario existente en Auth pero sin perfil
            if (createError.message?.toLowerCase().includes("already registered") || createError.status === 422) {
                console.log("[create-user] Usuario existe en Auth. Buscando ID...");
                
                const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
                
                if (listError) throw listError;
                
                const existingAuthUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
                if (existingAuthUser) {
                    targetUserId = existingAuthUser.id;
                } else {
                    throw new Error(`El correo ${email} está registrado pero no se pudo recuperar.`);
                }
            } else {
                throw new Error(`Error creando usuario: ${createError.message}`);
            }
        } else {
            finalUser = newUser.user;
        }
    }

    // 3. Actualizar usuario existente si se encontró ID
    if (targetUserId) {
        console.log(`[create-user] Actualizando usuario ${targetUserId}...`);
        const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            targetUserId,
            {
                password: password,
                user_metadata: { nombre, apellido, tenant_id: finalTenantId, role },
                email_confirm: true
            }
        );
        if (updateError) throw new Error(`Error actualizando usuario: ${updateError.message}`);
        finalUser = updatedUser.user;
    }

    if (!finalUser) throw new Error('No se pudo procesar el usuario.');

    // 4. Sincronizar perfil
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
    }

    return new Response(
      JSON.stringify({ success: true, user: finalUser }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Critical error in create-user:", error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})