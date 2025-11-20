-- Создаем таблицы для DEV версии с новыми именами
-- Таблица торговых настроек
CREATE TABLE IF NOT EXISTS public.trading_settings_dev (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange TEXT NOT NULL DEFAULT 'bybit',
    base_asset TEXT NOT NULL DEFAULT 'BTC',
    quote_asset TEXT NOT NULL DEFAULT 'USDT',
    symbol TEXT GENERATED ALWAYS AS (base_asset || quote_asset) STORED,
    order_amount_usd NUMERIC DEFAULT 100,
    leverage INTEGER DEFAULT 10,
    take_profit_percent NUMERIC DEFAULT 0.5,
    stop_loss_percent NUMERIC DEFAULT 1.0,
    funding_delay_ms INTEGER DEFAULT 5000,
    order_timeout_minutes INTEGER DEFAULT 30,
    long_tp_offset_percent NUMERIC DEFAULT 0.3,
    long_stop_loss_percent NUMERIC DEFAULT 2.0,
    telegram_notifications BOOLEAN DEFAULT true,
    auto_trading_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Таблица API ключей
CREATE TABLE IF NOT EXISTS public.api_keys_dev (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    passphrase TEXT,
    is_testnet BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, exchange)
);

-- Таблица тарифных планов
CREATE TABLE IF NOT EXISTS public.pricing_plans_dev (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    currency TEXT DEFAULT 'USD',
    duration_days INTEGER NOT NULL,
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица подписок пользователей
CREATE TABLE IF NOT EXISTS public.user_subscriptions_dev (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    plan_id TEXT,
    amount NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'pending',
    expires_at TIMESTAMP WITH TIME ZONE,
    invoice_id TEXT,
    order_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица админов
CREATE TABLE IF NOT EXISTS public.admins_dev (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Отключаем RLS для простоты в DEV среде
ALTER TABLE public.trading_settings_dev DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys_dev DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans_dev DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions_dev DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins_dev DISABLE ROW LEVEL SECURITY;

-- Добавляем тарифные планы
INSERT INTO public.pricing_plans_dev (plan_id, name, price, currency, duration_days, features, is_active)
VALUES 
    ('starter_weekly', 'Стартер (1 неделя)', 9.99, 'USD', 7, 
     '["Тестовый доступ", "Базовые функции", "Email поддержка"]'::jsonb, true),
    ('basic_monthly', 'Базовый (1 месяц)', 29.99, 'USD', 30, 
     '["Доступ ко всем биржам", "Автоматическая торговля", "Telegram уведомления", "Техническая поддержка"]'::jsonb, true),
    ('pro_quarterly', 'Профессиональный (3 месяца)', 79.99, 'USD', 90, 
     '["Все функции базового плана", "Приоритетная поддержка", "Расширенная аналитика", "Скидка 11%"]'::jsonb, true),
    ('premium_yearly', 'Премиум (1 год)', 299.99, 'USD', 365, 
     '["Все функции профессионального плана", "VIP поддержка", "Персональные настройки", "Скидка 17%"]'::jsonb, true)
ON CONFLICT (plan_id) DO NOTHING;

-- Делаем cloudkroter@gmail.com админом и даем подписку на год
INSERT INTO public.admins_dev (user_id)
SELECT id FROM auth.users WHERE email = 'cloudkroter@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_subscriptions_dev (user_id, email, plan_id, amount, currency, status, expires_at)
SELECT 
    id, 
    'cloudkroter@gmail.com', 
    'admin_lifetime', 
    0, 
    'USD', 
    'active', 
    '2026-11-06'::timestamp
FROM auth.users 
WHERE email = 'cloudkroter@gmail.com'
ON CONFLICT DO NOTHING;