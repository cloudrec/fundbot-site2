-- Создание таблицы для API ключей бирж
CREATE TABLE IF NOT EXISTS public.api_keys_2025_11_06_12_23 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange TEXT NOT NULL CHECK (exchange IN ('bybit', 'binance', 'mexc', 'gate', 'kucoin')),
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    passphrase TEXT, -- Для KuCoin
    testnet BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, exchange, testnet) -- Один ключ на биржу на пользователя
);

-- Создание индексов
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys_2025_11_06_12_23(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_exchange ON public.api_keys_2025_11_06_12_23(exchange);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON public.api_keys_2025_11_06_12_23(is_active);

-- Включение RLS
ALTER TABLE public.api_keys_2025_11_06_12_23 ENABLE ROW LEVEL SECURITY;

-- Политики RLS
CREATE POLICY "Users can view own API keys" ON public.api_keys_2025_11_06_12_23
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys" ON public.api_keys_2025_11_06_12_23
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys" ON public.api_keys_2025_11_06_12_23
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys" ON public.api_keys_2025_11_06_12_23
    FOR DELETE USING (auth.uid() = user_id);