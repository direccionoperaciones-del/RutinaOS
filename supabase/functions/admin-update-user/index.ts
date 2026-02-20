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
      throw new Error('Server configuration error.')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Authenticate the admin making the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Auth header missing')
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: adminUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !adminUser) throw new Error('Invalid session.')

    // 2. Check admin's role for permission
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', adminUser.id)
      .single()

    if (!adminProfile || !['director', 'superadmin'].includes(adminProfile.role)) {
      return new Response(JSON.stringify({ error: 'Permission denied.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Get request body
    const { action, email, password } = await req.json()

    if (action === 'reset_password') {
      if (!email || !password) {
        throw new Error('Email and new password are required.')
      }

      // 4. Find the target user by email
      const { data: { user: targetUser }, error: findError } = await supabaseAdmin.auth.admin.getUserByEmail(email);
      
      if (findError || !targetUser) {
        return new Response(JSON.stringify({ error: 'User not found.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // 5. Update the user's password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUser.id,
        { password: password }
      )

      if (updateError) throw updateError

      return new Response(
        JSON.stringify({ success: true, message: 'Password updated.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )

  } catch (error: any) {
    console.error("[admin-update-user] Error:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})