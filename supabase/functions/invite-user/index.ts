import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de Preflight request (CORS)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log("[invite-user] Iniciando proceso de invitación...");
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Configuración del servidor incompleta.')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Validar Admin logueado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No se encontró cabecera de autorización.');
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requester }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !requester) throw new Error('Sesión de administrador no válida o expirada.');

    const { data: profile } = await supabaseAdmin.from('profiles').select('role, tenant_id').eq('id', requester.id).single()
    
    if (!profile || !['director', 'superadmin'].includes(profile.role)) {
      throw new Error('No tienes permisos suficientes para invitar usuarios.');
    }

    // 2. Extraer y validar datos del cuerpo
    const { email, nombre, apellido, role, tenant_id } = await req.json()
    const finalTenantId = profile.role === 'superadmin' ? (tenant_id || profile.tenant_id) : profile.tenant_id
    
    if (!email || !finalTenantId) {
      throw new Error('Email y Organización (Tenant ID) son obligatorios.');
    }

    console.log(`[invite-user] Invitando a: ${email}`);

    // Configurar URL de redirección segura
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
      // Intentar enviar correo oficial de Supabase
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { nombre, apellido, tenant_id: finalTenantId, role },
        redirectTo: redirectTo
      });

      if (inviteErr) {
        // Si falla porque ya existe, intentamos flujo de recuperación
        const msg = inviteErr.message?.toLowerCase() || '';
        if (msg.includes('already registered') || msg.includes('already exists') || inviteErr.status === 422) {
          
          console.log("[invite-user] Usuario existe. Intentando recuperación...");
          
          const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: redirectTo }
          });
          
          if (linkErr) throw linkErr;
          
          targetUser = linkData.user;
          // Si el usuario ya existe, no forzamos modo manual a menos que falle el envío de correo de recuperación, 
          // pero generateLink devuelve el link.
        } else {
          throw inviteErr; // Otro error, lanzar al catch general
        }
      } else {
        targetUser = inviteData.user;
        console.log("[invite-user] Invitación enviada exitosamente.");
      }

    } catch (error: any) {
      // Captura errores de red, SMTP o límites
      console.warn("[invite-user] Falló el envío de correo (SMTP/Límite). Generando link manual...", error.message);
      wasManual = true;
      
      // Intentamos generar link de invitación manual
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
          data: { nombre, apellido, tenant_id: finalTenantId, role },
          redirectTo: redirectTo
        }
      });

      if (linkErr) {
          // Si falla invitación manual (ej. usuario ya existe), probamos link de recuperación manual
          console.log("[invite-user] Falló link invitación manual. Probando recuperación manual...");
          const { data: recData, error: recErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: redirectTo }
          });
          
          if (recErr) {
            console.error("[invite-user] Falló todo intento de link manual:", recErr);
            throw recErr;
          }

          targetUser = recData.user;
          manualLink = recData.properties?.action_link;
      } else {
        targetUser = linkData.user;
        manualLink = linkData.properties?.action_link;
      }
    }

    // 4. Sincronizar Perfil en DB (Crucial para que aparezca en la lista de usuarios)
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
      
      if (profileError) {
        console.error("[invite-user] Error actualizando perfil:", profileError.message);
      }
    }

    // Respuesta final
    return new Response(JSON.stringify({ 
      success: true, 
      inviteLink: manualLink, 
      manualMode: wasManual 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    console.error("[invite-user] ERROR CRÍTICO:", error.message);
    return new Response(JSON.stringify({ error: error.message || 'Error interno del servidor' }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})