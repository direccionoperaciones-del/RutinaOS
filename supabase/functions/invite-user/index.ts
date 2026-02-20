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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Configuración del servidor incompleta (Missing Secrets).')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Auth Check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        throw new Error('Falta cabecera de autorización')
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestUser }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !requestUser) {
        console.error("Auth error:", userError);
        throw new Error('Sesión inválida o expirada.')
    }

    // 2. Permission Check
    const { data: requesterProfile } = await supabaseAdmin
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', requestUser.id)
        .single()

    if (!requesterProfile || (requesterProfile.role !== 'director' && requesterProfile.role !== 'superadmin')) {
        return new Response(JSON.stringify({ error: 'No tienes permisos para invitar usuarios.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Body Parsing
    let body;
    try {
        body = await req.json();
    } catch (e) {
        throw new Error("El cuerpo de la petición no es un JSON válido.");
    }

    const { email, nombre, apellido, role, tenant_id } = body;

    if (!email || !nombre || !apellido || !role) {
        throw new Error('Faltan campos obligatorios (email, nombre, apellido, role).')
    }

    // Tenant Resolution
    let finalTenantId = requesterProfile.tenant_id;
    if (requesterProfile.role === 'superadmin' && tenant_id) {
        finalTenantId = tenant_id;
    }

    // Validate origin for redirect
    const origin = req.headers.get('origin') || 'https://runop.app';
    const redirectTo = `${origin}/`;

    console.log(`Inviting ${email} to tenant ${finalTenantId} with redirect ${redirectTo}`);

    // 4. Invite Logic
    const { data: newUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
            nombre: nombre,
            apellido: apellido,
            tenant_id: finalTenantId,
            role: role
        },
        redirectTo: redirectTo
    })

    if (inviteError) {
        console.error("Supabase Invite Error:", inviteError);
        // Supabase devuelve errores como "Enter a valid email address", etc.
        throw new Error(`Error de Supabase: ${inviteError.message}`)
    }

    // 5. Ensure Profile Sync
    if (newUser.user) {
         const { error: upsertError } = await supabaseAdmin
        .from('profiles')
        .upsert({ 
            id: newUser.user.id,
            tenant_id: finalTenantId,
            email: email,
            nombre: nombre,
            apellido: apellido,
            role: role,
            activo: true
        });
        
        if (upsertError) {
            console.error("Profile Upsert Error:", upsertError);
            // No fallamos la request completa si el invite funcionó, pero logueamos
        }
    }

    return new Response(
      JSON.stringify({ success: true, user: newUser.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Function Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error interno del servidor" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})