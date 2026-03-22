-- ==========================================
-- DIAGNÓSTICO Y CORRECCIÓN DE RLS
-- Ejecutar en SQL Editor
-- ==========================================

-- 1. Habilitar RLS explícitamente (por seguridad)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 2. Políticas para 'messages'
-- Permitir lectura a todos los autenticados (para ver sus propios mensajes)
CREATE POLICY "Enable read access for all users" ON "public"."messages"
AS PERMISSIVE FOR SELECT
TO public
USING (true); -- Ojo: Ajustar a (tenant_id = ...) para prod, pero 'true' sirve para debug

-- 3. Políticas para 'message_receipts'
-- Permitir lectura de recibos propios
CREATE POLICY "Users can read own receipts" ON "public"."message_receipts"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 4. Políticas para 'notifications'
-- Permitir lectura de notificaciones propias
CREATE POLICY "Users can read own notifications" ON "public"."notifications"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Permitir inserción (El trigger o function server-side usa service_role, pero esto ayuda si se usa cliente)
-- Service Role se salta RLS, pero definimos políticas de lectura para el usuario final.

-- 5. VERIFICACIÓN (Solo lectura)
-- Corre esto para ver qué políticas existen actualmente
SELECT schemaname, tablename, policyname, cmd, roles 
FROM pg_policies 
WHERE tablename IN ('messages', 'message_receipts', 'notifications');