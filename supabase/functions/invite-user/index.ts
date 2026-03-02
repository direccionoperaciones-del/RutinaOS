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
    console.log("[invite-user] Init...")

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Auth Check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requester }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !requester) throw new Error('Invalid session')

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', requester.id)
      .single()

    if (!profile || !['director', 'superadmin'].includes(profile.role)) {
      throw new Error('Permission denied')
    }

    // 2. Payload Validation
    const { email, nombre, apellido, role, tenant_id } = await req.json()
    const finalTenantId = profile.role === 'superadmin'
      ? (tenant_id || profile.tenant_id)
      : profile.tenant_id

    if (!email || !finalTenantId) throw new Error('Missing required fields')

    // URL Config
    let origin = 'https://runop.app'
    const reqOrigin = req.headers.get('origin')
    if (reqOrigin && (reqOrigin.includes('localhost') || reqOrigin.includes('127.0.0.1'))) {
      origin = reqOrigin
    }
    const redirectTo = `${origin}/update-password`

    let targetUser = null
    let manualLink = null
    let wasManual = false

    // Helper: genera link manual (invite → recovery como fallback)
    const generateManualLink = async () => {
      wasManual = true
      console.log("[invite-user] Generating manual link...")

      const { data: invLink, error: invLinkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
          data: { nombre, apellido, tenant_id: finalTenantId, role },
          redirectTo: redirectTo
        }
      })

      if (!invLinkErr && invLink) {
        return { user: invLink.user, link: invLink.properties?.action_link }
      }

      // Si invite falla (usuario ya existe), usar recovery
      console.log("[invite-user] Invite link failed, trying recovery...")
      const { data: recLink, error: recLinkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: email,
        options: { redirectTo: redirectTo }
      })

      if (recLinkErr) throw new Error(`Could not generate link: ${recLinkErr.message}`)

      return { user: recLink.user, link: recLink.properties?.action_link }
    }

    // 3. Intentar invitación estándar
    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { nombre, apellido, tenant_id: finalTenantId, role },
      redirectTo: redirectTo
    })

    if (!inviteErr) {
      console.log("[invite-user] Invite email sent.")
      targetUser = inviteData.user

    } else {
      const msg = inviteErr.message?.toLowerCase() || ''
      const isAlreadyExists = msg.includes('already registered') || msg.includes('already exists') || inviteErr.status === 422

      if (isAlreadyExists) {
        // Usuario existe: intentar generar recovery directamente
        console.log("[invite-user] User exists, sending recovery...")
        const { data: recData, error: recErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: email,
          options: { redirectTo: redirectTo }
        })

        if (!recErr && recData) {
          targetUser = recData.user
          manualLink = recData.properties?.action_link
          wasManual = true // Marcamos como manual para mostrar el link
        } else {
          // Si el recovery falla, forzar helper manual
          const result = await generateManualLink()
          targetUser = result.user
          manualLink = result.link
        }

      } else {
        // Error SMTP u otro — generar link manual directamente
        console.warn("[invite-user] SMTP/other error:", inviteErr.message)
        const result = await generateManualLink()
        targetUser = result.user
        manualLink = result.link
      }
    }

    // 4. Sync Profile
    if (targetUser) {
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
        id: targetUser.id,
        tenant_id: finalTenantId,
        email: email.toLowerCase(),
        nombre: nombre,
        apellido: apellido,
        role: role,
        activo: true
      })
      if (profileError) console.error("[invite-user] Profile sync error:", profileError.message)
    }

    return new Response(JSON.stringify({
      success: true,
      inviteLink: manualLink,
      manualMode: wasManual
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    console.error("[invite-user] Critical error:", error.message)
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})