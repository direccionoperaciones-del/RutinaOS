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

    // 1. Verificar quien llama (Seguridad)
    const authHeader = req.headers.get('Authorization')
    const { data: { user: requester }, error: authError } = await supabaseAdmin.auth.getUser(authHeader?.replace('Bearer ', '') || '')
    if (authError || !requester) throw new Error('Sesión de administrador inválida.')

    const { data: profile } = await supabaseAdmin.from('profiles').select('role, tenant_id').eq('id', requester.id).single()
    if (!profile || !['director', 'superadmin'].includes(profile.role)) throw new Error('No tienes permisos para invitar usuarios.')

    // 2. Datos de la invitación
    const { email, nombre, apellido, role, tenant_id } = await req.json()
    const finalTenantId = profile.role === 'superadmin' ? (tenant_id || profile.tenant_id) : profile.tenant_id
    
    // IMPORTANTE: Aseguramos que la URL de redirección sea limpia
    const origin = req.headers.get('origin') || 'https://runop.app'
    const redirectTo = `${origin.replace(/\/$/, '')}/` 
    const metadata = { nombre, apellido, tenant_id: finalTenantId, role }

    console.log(`[invite-user] Procesando: ${email} (Tenant: ${finalTenantId})`)

    let targetUser;
    let manualLink = null;
    let wasManual = false;

    // --- PASO 3: INTENTO AUTOMÁTICO (VÍA TU SMTP CONFIGURADO) ---
    try {
      // Intentamos invitar. Si el SMTP está mal, esto saltará al catch.
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: metadata,
        redirectTo: redirectTo
      });

      if (inviteErr) {
        // Si el usuario ya existe, enviamos enlace de acceso (Magic Link)
        if (inviteErr.message?.includes('already registered') || inviteErr.message?.includes('already exists')) {
          console.log("[invite-user] Usuario existe. Enviando Magic Link...");
          const { error: otpError } = await supabaseAdmin.auth.admin.signInWithOtp({
            email,
            options: { emailRedirectTo: redirectTo }
          });
          if (otpError) throw otpError;
          
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
          targetUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        } else {
          throw inviteErr;
        }
      } else {
        targetUser = inviteData.user;
      }
      console.log("[invite-user] Éxito automático.");

    } catch (smtpError: any) {
      console.error("[invite-user] ERROR SMTP/AUTO:", smtpError.message);
      
      // --- PASO 4: FALLBACK MANUAL (Backup si falla el correo) ---
      wasManual = true;
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const existing = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      const type = existing ? 'magiclink' : 'invite';

      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: type,
        email: email,
        options: {
          data: !existing ? metadata : undefined,
          redirectTo: redirectTo
        }
      });

      if (linkErr) throw new Error(`Error crítico generando enlace: ${linkErr.message}`);

      targetUser = linkData.user;
      // @ts-ignore
      manualLink = linkData.properties?.action_link;
      console.log("[invite-user] Enlace manual generado.");
    }

    // 5. Sincronizar Perfil
    if (targetUser) {
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({ 
        id: targetUser.id,
        tenant_id: finalTenantId,
        email: email,
        nombre: nombre || targetUser.user_metadata?.nombre,
        apellido: apellido || targetUser.user_metadata?.apellido,
        role: role || targetUser.user_metadata?.role,
        activo: true
      });
      if (profileError) console.error("[invite-user] Error perfil:", profileError.message);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      inviteLink: manualLink, 
      manualMode: wasManual 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error("[invite-user] Error global:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})