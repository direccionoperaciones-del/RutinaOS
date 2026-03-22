-- Habilitar acceso total a PDV para superadmin
-- Esta política permite al superadmin ver y editar PDVs de cualquier tenant
CREATE POLICY "superadmin_pdv_all" ON "public"."pdv"
AS PERMISSIVE FOR ALL
TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

-- Habilitar acceso total a Asignaciones para superadmin
-- Necesario para ver y asignar responsables en cualquier tenant
CREATE POLICY "superadmin_pdv_assignments_all" ON "public"."pdv_assignments"
AS PERMISSIVE FOR ALL
TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());