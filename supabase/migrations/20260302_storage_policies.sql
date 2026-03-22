-- 1. Políticas para 'LogoApp' (Logos de empresa)
-- Permite a Directores y Superadmins subir y actualizar logos
CREATE POLICY "Permitir subida de logos a directores"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'LogoApp' AND 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('director', 'superadmin')
  )
);

CREATE POLICY "Permitir actualización de logos a directores"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'LogoApp' AND 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('director', 'superadmin')
  )
);

CREATE POLICY "Acceso público de lectura a logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'LogoApp');


-- 2. Políticas para 'avatars' (Fotos de perfil)
CREATE POLICY "Usuarios pueden gestionar su propio avatar"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');


-- 3. Políticas para 'evidence' (Fotos de tareas)
CREATE POLICY "Personal operativo puede subir evidencias"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'evidence')
WITH CHECK (bucket_id = 'evidence');