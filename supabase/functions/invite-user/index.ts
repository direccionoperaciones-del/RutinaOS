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
      throw new Error('Configuración del servidor incompleta.')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Verificar Autenticación del que invita
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        throw new Error('Falta cabecera de autorización')
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestUser }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !requestUser) {
        throw new Error('Sesión inválida o expirada.')
    }

    // 2. Verificar Permisos (Director o Superadmin)
    const { data: requesterProfile } = await supabaseAdmin
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', requestUser.id)
        .single()

    if (!requesterProfile || (requesterProfile.role !== 'director' && requesterProfile.role !== 'superadmin')) {
        return new Response(JSON.stringify({ error: 'No tienes permisos para invitar usuarios.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { email, nombre, apellido, role, tenant_id } = await req.json()

    if (!email || !nombre || !apellido || !role) {
        throw new Error('Faltan campos obligatorios.')
    }

    // Determinar Tenant
    let finalTenantId = requesterProfile.tenant_id;
    if (requesterProfile.role === 'superadmin' && tenant_id) {
        finalTenantId = tenant_id;
    }

    // 3. Invitar Usuario (Magic Link)
    // Esto enviará el correo configurado en Supabase Authentication > Email Templates > Invite User
    const { data: newUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
            nombre: nombre,
            apellido: apellido,
            tenant_id: finalTenantId,
            role: role
        },
        // Redirige al home de la app. Asegúrate que Site URL esté configurado en Supabase
        redirectTo: `${req.headers.get('origin') || 'https://runop.app'}/` 
    })

    if (inviteError) {
        throw inviteError
    }

    // 4. Asegurar Perfil (Doble check para garantizar datos correctos)
    if (newUser.user) {
         await supabaseAdmin
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
    }

    return new Response(
      JSON.stringify({ success: true, user: newUser.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})