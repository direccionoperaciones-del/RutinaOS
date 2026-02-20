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
      throw new Error('Configuración del servidor incompleta.')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Auth Check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Falta cabecera de autorización')
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestUser }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !requestUser) throw new Error('Sesión inválida.')

    // 2. Permission Check
    const { data: requesterProfile } = await supabaseAdmin
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', requestUser.id)
        .single()

    if (!requesterProfile || (requesterProfile.role !== 'director' && requesterProfile.role !== 'superadmin')) {
        return new Response(JSON.stringify({ error: 'No tienes permisos.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Parse Body
    const { email, nombre, apellido, role, tenant_id } = await req.json();

    if (!email) throw new Error("Email requerido");

    // 4. Determine Tenant
    let finalTenantId = requesterProfile.tenant_id;
    if (requesterProfile.role === 'superadmin' && tenant_id) finalTenantId = tenant_id;

    const origin = req.headers.get('origin') || 'https://runop.app';
    const redirectTo = `${origin}/`; 

    console.log(`Processing ${email} for tenant ${finalTenantId}`);

    // 5. SMART LOGIC: Check if user exists
    let newUser;
    let inviteLink = null;
    let manualMode = false;
    let linkType: 'invite' | 'magiclink' = 'invite';

    // Buscamos si el usuario ya existe para decidir qué tipo de link generar
    // Nota: listUsers trae por paginación (def 50), para producción masiva usar search, pero aquí iteramos.
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
        console.log("Usuario existente detectado. Usando Magic Link.");
        linkType = 'magiclink'; // Login directo
        newUser = existingUser;
    }

    const metadata = { nombre, apellido, tenant_id: finalTenantId, role };

    // Generación Manual del Link (Forzamos manual porque sabemos que el SMTP está fallando)
    try {
        console.log(`Generando link manual tipo: ${linkType}`);
        
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: linkType,
            email: email,
            options: {
                data: (linkType === 'invite') ? metadata : undefined, // Magic link a veces ignora data, updateamos perfil abajo
                redirectTo: redirectTo
            }
        });

        if (linkError) {
            // Si falló 'invite' porque el usuario existía (y no lo detectamos arriba), reintentamos magiclink
            if (linkType === 'invite' && linkError.message?.includes('already registered')) {
                 console.log("Fallo invite, reintentando como magiclink...");
                 const retryResult = await supabaseAdmin.auth.admin.generateLink({
                    type: 'magiclink',
                    email: email,
                    options: { redirectTo }
                });
                if (retryResult.error) throw retryResult.error;
                
                newUser = retryResult.data.user;
                // @ts-ignore
                inviteLink = retryResult.data.properties?.action_link;
                linkType = 'magiclink';
            } else {
                throw linkError;
            }
        } else {
            newUser = linkData.user;
            // @ts-ignore
            inviteLink = linkData.properties?.action_link;
        }
        
        manualMode = true;

    } catch (err: any) {
        console.error("Error generando link:", err);
        throw new Error(`Error generando enlace: ${err.message}`);
    }

    // 6. Actualizar Perfil (Upsert para asegurar datos y permisos)
    if (newUser) {
        await supabaseAdmin.from('profiles').upsert({ 
            id: newUser.id,
            tenant_id: finalTenantId,
            email: email,
            nombre: nombre || existingUser?.user_metadata?.nombre,
            apellido: apellido || existingUser?.user_metadata?.apellido,
            role: role || existingUser?.user_metadata?.role,
            activo: true
        });
    }

    return new Response(
      JSON.stringify({ 
          success: true, 
          user: newUser, 
          inviteLink: inviteLink,
          manualMode: manualMode,
          linkType: linkType 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})