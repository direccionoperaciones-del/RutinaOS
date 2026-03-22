import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de Preflight (CORS)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Configuración del servidor incompleta (Variables de entorno).')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Autenticar al administrador que hace la petición
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Falta cabecera de autorización')
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: adminUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !adminUser) throw new Error('Sesión inválida o expirada.')

    // 2. Verificar rol del administrador (Permisos)
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', adminUser.id)
      .single()

    if (!adminProfile || !['director', 'superadmin'].includes(adminProfile.role)) {
      return new Response(
        JSON.stringify({ error: 'Permiso denegado. Solo directores pueden realizar esta acción.' }), 
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Obtener datos del cuerpo
    const { action, email, userId, password } = await req.json()

    if (action === 'reset_password') {
      if (!password || password.length < 6) {
        throw new Error('La contraseña es requerida y debe tener al menos 6 caracteres.')
      }

      let targetUserId = userId;

      // Si no viene ID pero viene email, buscamos el ID (Retrocompatibilidad)
      if (!targetUserId && email) {
        const { data: { user: targetUser }, error: findError } = await supabaseAdmin.auth.admin.getUserByEmail(email);
        if (findError || !targetUser) {
          return new Response(
            JSON.stringify({ error: `Usuario no encontrado con el email: ${email}` }), 
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        targetUserId = targetUser.id;
      }

      if (!targetUserId) {
        throw new Error('Se requiere userId o email para identificar al usuario.')
      }

      // 4. Actualizar contraseña directamente por ID
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        { password: password }
      )

      if (updateError) throw updateError

      return new Response(
        JSON.stringify({ success: true, message: 'Contraseña actualizada correctamente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Acción no válida.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )

  } catch (error: any) {
    console.error("[admin-update-user] Error:", error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno del servidor.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})