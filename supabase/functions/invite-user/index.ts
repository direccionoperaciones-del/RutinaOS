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
    const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!)

    // 1. Auth Check
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
      throw new Error('Permiso denegado')
    }

    // 2. Payload & URL Config
    const { email: rawEmail, nombre, apellido, role, tenant_id } = await req.json()
    const email = rawEmail.toLowerCase().trim()
    const finalTenantId = profile.role === 'superadmin' ? (tenant_id || profile.tenant_id) : profile.tenant_id

    // Detectar el origen de la petición de forma dinámica
    const reqOrigin = req.headers.get('origin') || 'https://runop.app'
    const redirectTo = `${reqOrigin}/update-password`

    let targetUser = null
    let manualLink = null
    let wasManual = false

    const generateManualLink = async () => {
      wasManual = true
      // Intentar invite manual
      const { data: invLink, error: invErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: { nombre, apellido, tenant_id: finalTenantId, role }, redirectTo }
      })

      if (!invErr && invLink) return { user: invLink.user, link: invLink.properties?.action_link }

      // Fallback a recovery si el usuario ya existe
      const { data: recLink, error: recErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo }
      })

      if (recErr) throw new Error(`No se pudo generar el enlace: ${recErr.message}`)
      return { user: recLink.user, link: recLink.properties?.action_link }
    }

    // 3. Intentar invitación estándar (envío de email)
    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { nombre, apellido, tenant_id: finalTenantId, role },
      redirectTo
    })

    if (!inviteErr) {
      targetUser = inviteData.user
    } else {
      // Si falla el envío (SMTP no configurado o rate limit), generamos el link manual
      console.warn("[invite-user] Error en envío automático:", inviteErr.message)
      const result = await generateManualLink()
      targetUser = result.user
      manualLink = result.link
    }

    // 4. Sync Profile
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
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})