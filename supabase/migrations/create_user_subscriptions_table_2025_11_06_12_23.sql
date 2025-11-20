-- Создание таблицы подписок пользователей
CREATE TABLE IF NOT EXISTS public.user_subscriptions_2025_11_06_12_23 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invoice_id TEXT UNIQUE,
    order_number TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, active, expired, cancelled
    amount DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions_2025_11_06_12_23(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_email ON public.user_subscriptions_2025_11_06_12_23(email);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_invoice_id ON public.user_subscriptions_2025_11_06_12_23(invoice_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON public.user_subscriptions_2025_11_06_12_23(status);

-- Включаем RLS
ALTER TABLE public.user_subscriptions_2025_11_06_12_23 ENABLE ROW LEVEL SECURITY;

-- Создаем политики RLS
CREATE POLICY "Users can view own subscriptions" ON public.user_subscriptions_2025_11_06_12_23
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions" ON public.user_subscriptions_2025_11_06_12_23
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions" ON public.user_subscriptions_2025_11_06_12_23
    FOR UPDATE USING (auth.uid() = user_id);

-- Функция для проверки активной подписки
CREATE OR REPLACE FUNCTION public.check_user_subscription(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    has_active_subscription BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.user_subscriptions_2025_11_06_12_23
        WHERE user_id = user_uuid 
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
    ) INTO has_active_subscription;
    
    RETURN has_active_subscription;
END;
$$;

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION public.update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_subscription_updated_at_trigger
    BEFORE UPDATE ON public.user_subscriptions_2025_11_06_12_23
    FOR EACH ROW
    EXECUTE FUNCTION public.update_subscription_updated_at();