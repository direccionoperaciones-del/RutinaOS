-- SECURE REGISTRATION TRIGGER
-- Vulnerability Fix: Privilege Escalation via Registration Metadata
-- This update modifies handle_new_user to:
-- 1. Ignore 'role' and 'tenant_id' passed in user metadata (preventing injection).
-- 2. Only create a profile/tenant if 'tenant_name' is provided (Self-Registration).
-- 3. Force the role to 'director' for self-registered tenants.
-- 4. Do nothing for other cases (Admin/Invite creation handles profile insertion securely).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id UUID;
  v_tenant_name TEXT;
  v_tenant_code TEXT;
BEGIN
  -- 1. Self-Registration (Creates new Tenant)
  -- This flow is triggered ONLY when 'tenant_name' is present in metadata.
  IF (new.raw_user_meta_data ->> 'tenant_name') IS NOT NULL THEN
    
    v_tenant_name := new.raw_user_meta_data ->> 'tenant_name';
    -- Generate simple code: 4 chars of name + 6 chars of random hash
    v_tenant_code := UPPER(SUBSTRING(REGEXP_REPLACE(v_tenant_name, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4)) 
                     || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);
    
    -- Create Tenant
    INSERT INTO public.tenants (nombre, codigo, activo)
    VALUES (v_tenant_name, v_tenant_code, true)
    RETURNING id INTO v_tenant_id;

    -- Create Profile
    -- SECURITY: Force role to 'director'. Ignore any role passed in metadata.
    INSERT INTO public.profiles (id, tenant_id, nombre, apellido, email, role, activo)
    VALUES (
      new.id, 
      v_tenant_id,
      COALESCE(new.raw_user_meta_data ->> 'nombre', 'Usuario'), 
      COALESCE(new.raw_user_meta_data ->> 'apellido', 'Nuevo'),
      new.email,
      'director', -- Hardcoded security enforcement
      true
    )
    ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;
    
  END IF;

  -- 2. Invitations / Admin Creation
  -- If 'tenant_name' is missing, we assume the user is being created via the 'create-user' 
  -- Edge Function or an Invite system. Those systems create the profile manually 
  -- with the correct verified role/tenant. We do NOT rely on unverified metadata here.

  RETURN new;
END;
$$;