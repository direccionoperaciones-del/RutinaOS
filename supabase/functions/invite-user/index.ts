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
    
    // IMPORTANTE: Definir la URL de retorno explícitamente para evitar typos
    let origin = req.headers.get('origin') || 'https://runop.app';
    
    // Si no es localhost, forzamos runop.app para evitar errores de dominio (ej: runopp.app)
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      origin = 'https://runop.app';
    }
    
    const redirectTo = `${origin}/tasks`;

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
        // Si ya existe, enviamos Magic Link (Enlace de acceso)
        if (inviteErr.message?.includes('already registered') || inviteErr.message?.includes('already exists')) {
          await supabaseAdmin.auth.admin.signInWithOtp({
            email,
            options: { emailRedirectTo: redirectTo }
          });
          // Buscamos el ID para sincronizar perfil
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
          targetUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        } else {
          throw inviteErr;
        }
      } else {
        targetUser = inviteData.user;
      }
    } catch (smtpError: any) {
      console.error("[SMTP ERROR]:", smtpError.message);
      wasManual = true;
      
      // --- PASO 4: GENERAR LINK MANUAL ROBUSTO ---
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const existing = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: existing ? 'magiclink' : 'invite',
        email: email,
        options: {
          data: !existing ? { nombre, apellido, tenant_id: finalTenantId, role } : undefined,
          redirectTo: redirectTo
        }
      });

      if (linkErr) throw linkErr;
      targetUser = linkData.user;
      // @ts-ignore
      manualLink = linkData.properties?.action_link;
    }

    // 5. Sincronizar Perfil en DB
    if (targetUser) {
      await supabaseAdmin.from('profiles').upsert({ 
        id: targetUser.id,
        tenant_id: finalTenantId,
        email: email,
        nombre: nombre || targetUser.user_metadata?.nombre,
        apellido: apellido || targetUser.user_metadata?.apellido,
        role: role || targetUser.user_metadata?.role,
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