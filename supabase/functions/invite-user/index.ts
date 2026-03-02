import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!)

    // 1. Verificar quien invita
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const { data: { user: requester }, error: authError } = await supabaseAdmin.auth.getUser(token!)

    if (authError || !requester) throw new Error('Sesión inválida')

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', requester.id)
      .single()

    if (!profile || !['director', 'superadmin'].includes(profile.role)) {
      throw new Error('No tienes permisos para invitar usuarios.')
    }

    // 2. Datos del invitado
    const { email: rawEmail, nombre, apellido, role, tenant_id } = await req.json()
    const email = rawEmail.toLowerCase().trim()
    const finalTenantId = profile.role === 'superadmin' ? (tenant_id || profile.tenant_id) : profile.tenant_id

    // URL de redirección (Basada en tus capturas)
    const redirectTo = `https://runop.app/update-password`

    let targetUser = null
    let manualLink = null
    let wasManual = false

    // 3. Verificar si el usuario ya existe en Auth
    // Esto evita el error 422 de "ya registrado"
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    const existingAuthUser = users.find(u => u.email?.toLowerCase() === email)

    if (existingAuthUser) {
      console.log("[invite-user] El usuario ya existe. Generando link de recuperación/activación...");
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo }
      })

      if (linkErr) throw new Error(`Error al vincular usuario existente: ${linkErr.message}`)
      
      targetUser = linkData.user
      manualLink = linkData.properties?.action_link
      wasManual = true // Siempre manual si ya existe para asegurar acceso

    } else {
      // 4. Usuario nuevo: Intentar invitación por Email (SMTP)
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { nombre, apellido, tenant_id: finalTenantId, role },
        redirectTo
      })

      if (!inviteErr) {
        targetUser = inviteData.user
        console.log("[invite-user] Invitación enviada por SMTP con éxito.")
      } else {
        // FALLBACK: Si falla el SMTP (Hostinger error, etc), generamos link manual
        console.warn("[invite-user] SMTP Falló, generando link manual:", inviteErr.message)
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { data: { nombre, apellido, tenant_id: finalTenantId, role }, redirectTo }
        })

        if (linkErr) throw new Error(`Fallo total al crear usuario: ${linkErr.message}`)
        
        targetUser = linkData.user
        manualLink = linkData.properties?.action_link
        wasManual = true
      }
    }

    // 5. Sincronizar Perfil en Base de Datos
    if (targetUser) {
      await supabaseAdmin.from('profiles').upsert({
        id: targetUser.id,
        tenant_id: finalTenantId,
        email,
        nombre,
        apellido,
        role,
        activo: true
      })
    }

    return new Response(JSON.stringify({
      success: true,
      inviteLink: manualLink,
      manualMode: wasManual
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    console.error("[invite-user] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 400 
    })
  }
})