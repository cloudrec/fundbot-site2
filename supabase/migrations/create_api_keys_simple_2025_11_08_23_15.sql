-- Создаем таблицу api_keys которая отсутствует!
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    exchange TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    passphrase TEXT,
    is_testnet BOOLEAN DEFAULT false,
    has_passphrase BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, exchange)
);

-- Создаем индексы
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_exchange ON public.api_keys(exchange);

-- Включаем RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Простые политики RLS
DROP POLICY IF EXISTS "api_keys_select_policy" ON public.api_keys;
CREATE POLICY "api_keys_select_policy" ON public.api_keys
    FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "api_keys_insert_policy" ON public.api_keys;
CREATE POLICY "api_keys_insert_policy" ON public.api_keys
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "api_keys_update_policy" ON public.api_keys;
CREATE POLICY "api_keys_update_policy" ON public.api_keys
    FOR UPDATE USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "api_keys_delete_policy" ON public.api_keys;
CREATE POLICY "api_keys_delete_policy" ON public.api_keys
    FOR DELETE USING (auth.uid()::text = user_id);