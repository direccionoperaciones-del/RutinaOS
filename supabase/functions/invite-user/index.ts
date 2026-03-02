import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    console.log("[invite-user-v2] Iniciando proceso de invitación...");
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!)

    // 1. Validar Admin logueado
    const authHeader = req.headers.get('Authorization')
    const { data: { user: requester }, error: authError } = await supabaseAdmin.auth.getUser(authHeader?.replace('Bearer ', '') || '')
    if (authError || !requester) throw new Error('Sesión de administrador no válida.')

    const { data: profile } = await supabaseAdmin.from('profiles').select('role, tenant_id').eq('id', requester.id).single()
    if (!profile || !['director', 'superadmin'].includes(profile.role)) throw new Error('No tienes permisos.')

    // 2. Extraer y validar datos
    const { email, nombre, apellido, role, tenant_id } = await req.json()
    const finalTenantId = profile.role === 'superadmin' ? (tenant_id || profile.tenant_id) : profile.tenant_id
    
    if (!email || !finalTenantId) throw new Error('Email y Organización obligatorios.');

    console.log(`[invite-user-v2] Invitando a: ${email}`);

    // Redirección segura
    let origin = 'https://runop.app';
    const reqOrigin = req.headers.get('origin');
    if (reqOrigin && (reqOrigin.includes('localhost') || reqOrigin.includes('127.0.0.1'))) {
      origin = reqOrigin;
    }
    const redirectTo = `${origin}/update-password`;

    let targetUser = null;
    let manualLink = null;
    let wasManual = false;

    // --- PASO 3: INTENTO DE INVITACIÓN ---
    try {
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { nombre, apellido, tenant_id: finalTenantId, role },
        redirectTo: redirectTo
      });

      if (inviteErr) {
        if (inviteErr.message?.toLowerCase().includes('already registered') || 
            inviteErr.message?.toLowerCase().includes('already exists')) {
          
          console.log("[invite-user-v2] Usuario ya existe. Generando recuperación...");
          
          const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: redirectTo }
          });
          
          if (linkErr) throw linkErr;
          
          targetUser = linkData.user;
          manualLink = linkData.properties?.action_link;
          wasManual = !manualLink; 
        } else {
          throw inviteErr;
        }
      } else {
        targetUser = inviteData.user;
      }
    } catch (smtpError: any) {
      console.warn("[invite-user-v2] Error SMTP/Límite detectado. Usando modo manual.");
      wasManual = true;
      
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
          data: { nombre, apellido, tenant_id: finalTenantId, role },
          redirectTo: redirectTo
        }
      });

      if (linkErr) {
          // Fallback a recovery si invite falla (por ejemplo si ya existe)
          const { data: recData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: redirectTo }
          });
          targetUser = recData?.user;
          manualLink = recData?.properties?.action_link;
      } else {
        targetUser = linkData.user;
        manualLink = linkData.properties?.action_link;
      }
    }

    // 4. Sincronizar Perfil
    if (targetUser) {
      await supabaseAdmin.from('profiles').upsert({ 
        id: targetUser.id,
        tenant_id: finalTenantId,
        email: email.toLowerCase(),
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
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    console.error("[invite-user-v2] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})