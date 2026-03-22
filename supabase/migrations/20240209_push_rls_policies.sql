-- Habilitar RLS (Seguridad a nivel de fila)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 1. Permitir que el usuario INSERTE su propia suscripción
CREATE POLICY "Users can insert own subscription"
ON public.push_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 2. Permitir que el usuario ACTUALICE su propia suscripción (para renovar tokens)
CREATE POLICY "Users can update own subscription"
ON public.push_subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- 3. Permitir que el usuario LEA sus propias suscripciones (para diagnósticos)
CREATE POLICY "Users can select own subscription"
ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 4. Permitir borrar (por si se desuscribe)
CREATE POLICY "Users can delete own subscription"
ON public.push_subscriptions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);