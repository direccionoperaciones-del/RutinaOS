-- 1. Habilitar el rol 'superadmin' en el constraint existente
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('director', 'lider', 'administrador', 'auditor', 'superadmin'));

-- 2. Crear la Organización Maestra (Para alojar al Superadmin)
INSERT INTO public.tenants (nombre, codigo, activo)
VALUES ('Plataforma Admin', 'GOD-MODE', true)
ON CONFLICT (codigo) DO NOTHING;

-- 3. Función auxiliar para verificar si soy Superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'superadmin'
  );
$$;

-- 4. Asignar el rol al usuario (CON BYPASS DE SEGURIDAD)
DO $$
DECLARE
  v_admin_tenant_id uuid;
BEGIN
  -- IMPORTANTE: Desactivamos temporalmente la protección de roles para permitir este cambio manual
  ALTER TABLE public.profiles DISABLE TRIGGER trigger_protect_role_change;

  SELECT id INTO v_admin_tenant_id FROM tenants WHERE codigo = 'GOD-MODE';

  -- Si el usuario no existe, esto no hará nada (seguro)
  UPDATE public.profiles
  SET 
    role = 'superadmin',
    tenant_id = v_admin_tenant_id
  WHERE email = 'natalia.zoque@gmail.com';

  -- Volvemos a activar la protección inmediatamente
  ALTER TABLE public.profiles ENABLE TRIGGER trigger_protect_role_change;
END $$;

-- 5. INYECCIÓN DE PODERES (Policies Aditivas - GOD MODE)
-- Borramos policies anteriores si existen para evitar duplicados al reintentar
DROP POLICY IF EXISTS "superadmin_all_pdv" ON public.pdv;
DROP POLICY IF EXISTS "superadmin_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "superadmin_all_routines" ON public.routine_templates;
DROP POLICY IF EXISTS "superadmin_all_assignments" ON public.routine_assignments;
DROP POLICY IF EXISTS "superadmin_all_tasks" ON public.task_instances;
DROP POLICY IF EXISTS "superadmin_all_inv_cat" ON public.inventory_categories;
DROP POLICY IF EXISTS "superadmin_all_inv_prod" ON public.inventory_products;
DROP POLICY IF EXISTS "superadmin_all_inv_rows" ON public.inventory_submission_rows;
DROP POLICY IF EXISTS "superadmin_all_evidence" ON public.evidence_files;
DROP POLICY IF EXISTS "superadmin_all_tenants" ON public.tenants;
DROP POLICY IF EXISTS "superadmin_all_messages" ON public.messages;
DROP POLICY IF EXISTS "superadmin_all_audit" ON public.system_audit_log;
DROP POLICY IF EXISTS "superadmin_all_absences" ON public.user_absences;
DROP POLICY IF EXISTS "superadmin_all_cities" ON public.cities;
DROP POLICY IF EXISTS "superadmin_all_units" ON public.measurement_units;

-- Crear Policies
CREATE POLICY "superadmin_all_pdv" ON public.pdv FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_profiles" ON public.profiles FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_routines" ON public.routine_templates FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_assignments" ON public.routine_assignments FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_tasks" ON public.task_instances FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_inv_cat" ON public.inventory_categories FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_inv_prod" ON public.inventory_products FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_inv_rows" ON public.inventory_submission_rows FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_evidence" ON public.evidence_files FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_tenants" ON public.tenants FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_messages" ON public.messages FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_audit" ON public.system_audit_log FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_absences" ON public.user_absences FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_cities" ON public.cities FOR ALL TO authenticated USING (is_superadmin());
CREATE POLICY "superadmin_all_units" ON public.measurement_units FOR ALL TO authenticated USING (is_superadmin());