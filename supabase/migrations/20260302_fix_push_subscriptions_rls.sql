-- 1. Asegurar que el endpoint sea único (necesario para la operación UPSERT)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_key') THEN
        ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
    END IF;
END $$;

-- 2. Eliminar políticas restrictivas anteriores para recrearlas correctamente
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.push_subscriptions;

-- 3. Crear nuevas políticas más robustas
-- Permitir insertar si el user_id coincide con el autenticado
CREATE POLICY "push_subs_insert" ON public.push_subscriptions
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Permitir ver solo las propias
CREATE POLICY "push_subs_select" ON public.push_subscriptions
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Permitir actualizar si el usuario es el dueño O si la suscripción no tiene dueño (reclamar endpoint)
-- Esto soluciona el error de "USING expression" durante el upsert
CREATE POLICY "push_subs_update" ON public.push_subscriptions
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR user_id IS NULL)
WITH CHECK (auth.uid() = user_id);

-- Permitir borrar las propias
CREATE POLICY "push_subs_delete" ON public.push_subscriptions
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 4. Asegurar que el service_role (Edge Functions) mantenga acceso total
-- Esta política ya existía pero la reforzamos
DROP POLICY IF EXISTS "Service role full access" ON public.push_subscriptions;
CREATE POLICY "Service role full access" ON public.push_subscriptions
FOR ALL TO service_role
USING (true)
WITH CHECK (true);