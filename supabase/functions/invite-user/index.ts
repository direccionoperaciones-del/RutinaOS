import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    console.log("[invite-user] Iniciando proceso de invitación...");
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!)

    // 1. Validar Admin logueado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No se encontró cabecera de autorización.');
    
    const { data: { user: requester }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !requester) throw new Error('Sesión de administrador no válida o expirada.');

    const { data: profile } = await supabaseAdmin.from('profiles').select('role, tenant_id').eq('id', requester.id).single()
    if (!profile || !['director', 'superadmin'].includes(profile.role)) {
      throw new Error('No tienes permisos suficientes para invitar usuarios.');
    }

    // 2. Extraer y validar datos
    const { email, nombre, apellido, role, tenant_id } = await req.json()
    const finalTenantId = profile.role === 'superadmin' ? (tenant_id || profile.tenant_id) : profile.tenant_id
    
    if (!email || !finalTenantId) {
      throw new Error('Email y Organización (Tenant ID) son obligatorios.');
    }

    console.log(`[invite-user] Invitando a: ${email} para tenant: ${finalTenantId}`);

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
        // Caso: Usuario ya existe en AUTH
        if (inviteErr.message?.toLowerCase().includes('already registered') || 
            inviteErr.message?.toLowerCase().includes('already exists') ||
            inviteErr.status === 422) {
          
          console.log("[invite-user] El usuario ya existe en Auth. Generando link de recuperación...");
          
          const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: redirectTo }
          });
          
          if (linkErr) throw linkErr;
          
          targetUser = linkData.user;
          manualLink = linkData.properties?.action_link;
          // Si llegamos aquí sin error de SMTP en inviteUserByEmail, intentamos que Supabase mande el correo solo
        } else {
          throw inviteErr;
        }
      } else {
        targetUser = inviteData.user;
        console.log("[invite-user] Invitación enviada por Supabase.");
      }
    } catch (smtpError: any) {
      // Caso: Error de SMTP (Límite de correos de Supabase)
      console.warn("[invite-user] Error de SMTP detectado. Cambiando a modo manual...");
      wasManual = true;
      
      // Forzamos la generación de un link de invitación para mostrarlo en pantalla
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
          data: { nombre, apellido, tenant_id: finalTenantId, role },
          redirectTo: redirectTo
        }
      });

      if (linkErr) {
          // Si falla invitación manual, probamos recovery como último recurso
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

    // 4. Sincronizar Perfil en DB (Crucial para que aparezca en la lista)
    if (targetUser) {
      console.log(`[invite-user] Sincronizando perfil para UID: ${targetUser.id}`);
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({ 
        id: targetUser.id,
        tenant_id: finalTenantId,
        email: email.toLowerCase(),
        nombre: nombre,
        apellido: apellido,
        role: role,
        activo: true
      });
      
      if (profileError) console.error("[invite-user] Error actualizando perfil:", profileError.message);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      inviteLink: manualLink, 
      manualMode: wasManual 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    console.error("[invite-user] ERROR CRÍTICO:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})