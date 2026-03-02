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

    // 1. Validar Admin
    const authHeader = req.headers.get('Authorization')
    const { data: { user: requester }, error: authError } = await supabaseAdmin.auth.getUser(authHeader?.replace('Bearer ', '') || '')
    if (authError || !requester) throw new Error('Sesión de administrador no válida.')

    const { data: profile } = await supabaseAdmin.from('profiles').select('role, tenant_id').eq('id', requester.id).single()
    if (!profile || !['director', 'superadmin'].includes(profile.role)) throw new Error('No tienes permisos.')

    // 2. Datos
    const { email, nombre, apellido, role, tenant_id } = await req.json()
    const finalTenantId = profile.role === 'superadmin' ? (tenant_id || profile.tenant_id) : profile.tenant_id
    
    // REDIRECCIÓN ESTRATÉGICA: Los invitados deben ir a update-password para crear su clave
    let origin = 'https://runop.app';
    const reqOrigin = req.headers.get('origin');
    if (reqOrigin && (reqOrigin.includes('localhost') || reqOrigin.includes('127.0.0.1'))) {
      origin = reqOrigin;
    }
    
    const redirectTo = `${origin}/update-password`;

    let targetUser;
    let manualLink = null;
    let wasManual = false;

    // --- PASO 3: INTENTO AUTOMÁTICO ---
    try {
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { nombre, apellido, tenant_id: finalTenantId, role },
        redirectTo: redirectTo
      });

      if (inviteErr) {
        if (inviteErr.message?.includes('already registered') || inviteErr.message?.includes('already exists')) {
          // Si ya existe, enviamos un link de recuperación (que también va a update-password)
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: redirectTo }
          });
          targetUser = linkData?.user;
          manualLink = linkData?.properties?.action_link;
          wasManual = !manualLink; // Si no hay link, falló SMTP
        } else {
          throw inviteErr;
        }
      } else {
        targetUser = inviteData.user;
      }
    } catch (smtpError: any) {
      console.error("[SMTP ERROR]:", smtpError.message);
      wasManual = true;
      
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
          data: { nombre, apellido, tenant_id: finalTenantId, role },
          redirectTo: redirectTo
        }
      });

      if (linkErr) throw linkErr;
      targetUser = linkData.user;
      manualLink = linkData.properties?.action_link;
    }

    // 5. Sincronizar Perfil
    if (targetUser) {
      await supabaseAdmin.from('profiles').upsert({ 
        id: targetUser.id,
        tenant_id: finalTenantId,
        email: email,
        nombre: nombre,
        apellido: apellido,
        role: role,
        activo: true
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      inviteLink: manualLink, 
      manualMode: wasManual 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})