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

    // 2. Payload
    const { email: rawEmail, nombre, apellido, role, tenant_id } = await req.json()
    const email = rawEmail.toLowerCase().trim()
    const finalTenantId = profile.role === 'superadmin' ? (tenant_id || profile.tenant_id) : profile.tenant_id

    // URL de redirección (Asegúrate de que https://runop.app/* esté en Redirect URLs de Supabase)
    const origin = req.headers.get('origin') || 'https://runop.app'
    const redirectTo = `${origin}/update-password`

    let targetUser = null
    let manualLink = null
    let wasManual = false
    let specificError = ""

    // Helper: genera link manual si todo lo demás falla
    const generateManualLink = async (type: 'invite' | 'recovery' = 'invite') => {
      wasManual = true
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type,
        email,
        options: { data: { nombre, apellido, tenant_id: finalTenantId, role }, redirectTo }
      })
      if (error) return null
      return { user: data.user, link: data.properties?.action_link }
    }

    // 3. Lógica de invitación robusta
    try {
      // Intentar invitación estándar
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { nombre, apellido, tenant_id: finalTenantId, role },
        redirectTo
      })

      if (!inviteErr) {
        targetUser = inviteData.user
      } else {
        const msg = inviteErr.message.toLowerCase()
        specificError = inviteErr.message
        
        // Caso A: El usuario ya existe en Auth (pero quizás no en Profiles)
        if (msg.includes('already registered') || msg.includes('already exists') || inviteErr.status === 422) {
          console.log("[invite-user] El usuario ya existe. Intentando re-vincular...");
          
          // Generamos link de recuperación (que también sirve para activar)
          const result = await generateManualLink('recovery')
          if (result) {
            targetUser = result.user
            manualLink = result.link
          }
        } else {
          // Caso B: Error de SMTP o Rate Limit
          console.warn("[invite-user] Error SMTP/Supabase:", inviteErr.message)
          const result = await generateManualLink('invite')
          if (result) {
            targetUser = result.user
            manualLink = result.link
          }
        }
      }
    } catch (err) {
      console.error("[invite-user] Error inesperado en invite:", err)
      const result = await generateManualLink('invite')
      if (result) {
        targetUser = result.user
        manualLink = result.link
      }
    }

    // 4. Sincronizar Perfil
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
      manualMode: wasManual,
      debug: specificError
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})