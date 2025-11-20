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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_exchange ON public.api_keys(exchange);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_exchange ON public.api_keys(user_id, exchange);

-- Добавляем уникальное ограничение (один ключ на биржу на пользователя)
ALTER TABLE public.api_keys 
ADD CONSTRAINT IF NOT EXISTS unique_user_exchange 
UNIQUE (user_id, exchange);

-- Включаем RLS (Row Level Security)
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Создаем политику RLS - пользователи видят только свои ключи
CREATE POLICY IF NOT EXISTS "Users can view own API keys" ON public.api_keys
    FOR SELECT USING (auth.uid()::text = user_id OR auth.email() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own API keys" ON public.api_keys
    FOR INSERT WITH CHECK (auth.uid()::text = user_id OR auth.email() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own API keys" ON public.api_keys
    FOR UPDATE USING (auth.uid()::text = user_id OR auth.email() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own API keys" ON public.api_keys
    FOR DELETE USING (auth.uid()::text = user_id OR auth.email() = user_id);

-- Добавляем комментарии
COMMENT ON TABLE public.api_keys IS 'API ключи пользователей для торговых бирж';
COMMENT ON COLUMN public.api_keys.user_id IS 'ID пользователя (UUID или email)';
COMMENT ON COLUMN public.api_keys.exchange IS 'Название биржи (binance, bybit, gate)';
COMMENT ON COLUMN public.api_keys.api_key IS 'Публичный API ключ';
COMMENT ON COLUMN public.api_keys.api_secret IS 'Секретный API ключ';
COMMENT ON COLUMN public.api_keys.passphrase IS 'Passphrase для бирж которые его требуют';
COMMENT ON COLUMN public.api_keys.is_testnet IS 'Тестовая сеть или основная';
COMMENT ON COLUMN public.api_keys.has_passphrase IS 'Есть ли passphrase у этого ключа';