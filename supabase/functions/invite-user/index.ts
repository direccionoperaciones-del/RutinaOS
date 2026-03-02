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
    console.log("[invite-user-v3] Init...");
    
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

    const { data: profile } = await supabaseAdmin.from('profiles').select('role, tenant_id').eq('id', requester.id).single()
    
    if (!profile || !['director', 'superadmin'].includes(profile.role)) {
      throw new Error('Permission denied')
    }

    // 2. Payload Validation
    const { email, nombre, apellido, role, tenant_id } = await req.json()
    const finalTenantId = profile.role === 'superadmin' ? (tenant_id || profile.tenant_id) : profile.tenant_id
    
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

    // 3. Invitation Logic
    try {
      // Attempt Standard Invite
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { nombre, apellido, tenant_id: finalTenantId, role },
        redirectTo: redirectTo
      })

      if (inviteErr) {
        const msg = inviteErr.message?.toLowerCase() || ''
        
        // Handle User Already Exists
        if (msg.includes('already registered') || msg.includes('already exists') || inviteErr.status === 422) {
          console.log("[invite-user] User exists, sending recovery...")
          
          const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: redirectTo }
          })
          
          if (linkErr) throw linkErr
          
          targetUser = linkData.user
          // Only force manual if link generation worked but we want to display it? 
          // Usually recovery email is sent automatically by generateLink if SMTP works.
        } else {
          throw inviteErr
        }
      } else {
        targetUser = inviteData.user
      }

    } catch (error: any) {
      // Handle SMTP/Limit Errors -> Fallback to Manual Link
      console.warn("[invite-user] SMTP Error, switching to manual link:", error.message)
      wasManual = true
      
      // Try Manual Invite Link
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
          data: { nombre, apellido, tenant_id: finalTenantId, role },
          redirectTo: redirectTo
        }
      })

      if (linkErr) {
          // If Manual Invite fails (e.g. user exists), try Manual Recovery Link
          const { data: recData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: redirectTo }
          })
          targetUser = recData?.user
          manualLink = recData?.properties?.action_link
      } else {
        targetUser = linkData.user
        manualLink = linkData.properties?.action_link
      }
    }

    // 4. Sync Profile
    if (targetUser) {
      await supabaseAdmin.from('profiles').upsert({ 
        id: targetUser.id,
        tenant_id: finalTenantId,
        email: email.toLowerCase(),
        nombre: nombre,
        apellido: apellido,
        role: role,
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
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})