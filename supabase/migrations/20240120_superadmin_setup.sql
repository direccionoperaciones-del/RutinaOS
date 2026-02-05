-- 1. Habilitar el rol 'superadmin' en el constraint existente
-- Nota: Supabase no permite modificar constraints de texto fácilmente, así que lo recreamos de forma segura.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('director', 'lider', 'administrador', 'auditor', 'superadmin'));

-- 2. Crear la Organización Maestra (Para alojar al Superadmin)
-- Usamos un ID fijo o generado, pero aseguramos que exista.
INSERT INTO public.tenants (nombre, codigo, activo)
VALUES ('Plataforma Admin', 'GOD-MODE', true)
ON CONFLICT (codigo) DO NOTHING;

-- 3. Función auxiliar para verificar si soy Superadmin (Para usar en Policies)
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

-- 4. Asignar el rol al usuario específico (Natalia)
-- Buscamos el ID del tenant admin que acabamos de crear
DO $$
DECLARE
  v_admin_tenant_id uuid;
BEGIN
  SELECT id INTO v_admin_tenant_id FROM tenants WHERE codigo = 'GOD-MODE';

  UPDATE public.profiles
  SET 
    role = 'superadmin',
    tenant_id = v_admin_tenant_id
  WHERE email = 'natalia.zoque@gmail.com';
END $$;

-- 5. INYECCIÓN DE PODERES (Policies Aditivas)
-- Estas políticas se suman a las existentes. Si eres superadmin, entras.

-- PDV
CREATE POLICY "superadmin_all_pdv" ON public.pdv
FOR ALL TO authenticated USING (is_superadmin());

-- Perfiles
CREATE POLICY "superadmin_all_profiles" ON public.profiles
FOR ALL TO authenticated USING (is_superadmin());

-- Rutinas
CREATE POLICY "superadmin_all_routines" ON public.routine_templates
FOR ALL TO authenticated USING (is_superadmin());

-- Asignaciones
CREATE POLICY "superadmin_all_assignments" ON public.routine_assignments
FOR ALL TO authenticated USING (is_superadmin());

-- Tareas (Instances)
CREATE POLICY "superadmin_all_tasks" ON public.task_instances
FOR ALL TO authenticated USING (is_superadmin());

-- Inventarios
CREATE POLICY "superadmin_all_inv_cat" ON public.inventory_categories
FOR ALL TO authenticated USING (is_superadmin());

CREATE POLICY "superadmin_all_inv_prod" ON public.inventory_products
FOR ALL TO authenticated USING (is_superadmin());

CREATE POLICY "superadmin_all_inv_rows" ON public.inventory_submission_rows
FOR ALL TO authenticated USING (is_superadmin());

-- Evidencias
CREATE POLICY "superadmin_all_evidence" ON public.evidence_files
FOR ALL TO authenticated USING (is_superadmin());

-- Tenants (Para poder listar las empresas)
CREATE POLICY "superadmin_all_tenants" ON public.tenants
FOR ALL TO authenticated USING (is_superadmin());

-- Mensajes
CREATE POLICY "superadmin_all_messages" ON public.messages
FOR ALL TO authenticated USING (is_superadmin());

-- Log de Auditoría
CREATE POLICY "superadmin_all_audit" ON public.system_audit_log
FOR ALL TO authenticated USING (is_superadmin());

-- Novedades / Ausencias
CREATE POLICY "superadmin_all_absences" ON public.user_absences
FOR ALL TO authenticated USING (is_superadmin());

-- Ciudades y Unidades
CREATE POLICY "superadmin_all_cities" ON public.cities
FOR ALL TO authenticated USING (is_superadmin());

CREATE POLICY "superadmin_all_units" ON public.measurement_units
FOR ALL TO authenticated USING (is_superadmin());