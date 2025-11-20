-- Создание таблицы администраторов
CREATE TABLE IF NOT EXISTS public.admins_2025_11_06_12_23 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin', -- admin, super_admin
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Создание таблицы тарифных планов (управляемых админом)
CREATE TABLE IF NOT EXISTS public.pricing_plans_2025_11_06_12_23 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    duration_days INTEGER NOT NULL,
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.admins_2025_11_06_12_23(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Вставляем дефолтные планы
INSERT INTO public.pricing_plans_2025_11_06_12_23 (plan_id, name, price, duration_days, features) VALUES
('basic_monthly', 'Базовый (1 месяц)', 29.99, 30, '["Доступ ко всем биржам", "Автоматическая торговля", "Telegram уведомления", "Техническая поддержка"]'),
('pro_quarterly', 'Профессиональный (3 месяца)', 79.99, 90, '["Все функции базового плана", "Приоритетная поддержка", "Расширенная аналитика", "Скидка 11%"]'),
('premium_yearly', 'Премиум (1 год)', 299.99, 365, '["Все функции профессионального плана", "VIP поддержка", "Персональные настройки", "Скидка 17%"]')
ON CONFLICT (plan_id) DO NOTHING;

-- Создание индексов
CREATE INDEX IF NOT EXISTS idx_admins_user_id ON public.admins_2025_11_06_12_23(user_id);
CREATE INDEX IF NOT EXISTS idx_admins_email ON public.admins_2025_11_06_12_23(email);
CREATE INDEX IF NOT EXISTS idx_pricing_plans_active ON public.pricing_plans_2025_11_06_12_23(is_active);

-- Включаем RLS
ALTER TABLE public.admins_2025_11_06_12_23 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_plans_2025_11_06_12_23 ENABLE ROW LEVEL SECURITY;

-- Политики для админов (только админы могут видеть других админов)
CREATE POLICY "Admins can view all admins" ON public.admins_2025_11_06_12_23
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.admins_2025_11_06_12_23 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can insert new admins" ON public.admins_2025_11_06_12_23
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admins_2025_11_06_12_23 
            WHERE user_id = auth.uid()
        )
    );

-- Политики для тарифных планов (все могут читать, только админы могут изменять)
CREATE POLICY "Everyone can view active pricing plans" ON public.pricing_plans_2025_11_06_12_23
    FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage pricing plans" ON public.pricing_plans_2025_11_06_12_23
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.admins_2025_11_06_12_23 
            WHERE user_id = auth.uid()
        )
    );

-- Функция для проверки админских прав
CREATE OR REPLACE FUNCTION public.is_admin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM public.admins_2025_11_06_12_23
        WHERE user_id = user_uuid
    );
END;
$$;

-- Функция для создания пользователя с подпиской (только для админов)
CREATE OR REPLACE FUNCTION public.create_user_subscription(
    p_email TEXT,
    p_plan_id TEXT,
    p_duration_days INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result_data JSON;
    plan_duration INTEGER;
BEGIN
    -- Проверяем админские права
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin rights required';
    END IF;
    
    -- Получаем длительность плана если не указана
    IF p_duration_days IS NULL THEN
        SELECT duration_days INTO plan_duration 
        FROM public.pricing_plans_2025_11_06_12_23 
        WHERE plan_id = p_plan_id AND is_active = true;
        
        IF plan_duration IS NULL THEN
            RAISE EXCEPTION 'Plan not found or inactive: %', p_plan_id;
        END IF;
    ELSE
        plan_duration := p_duration_days;
    END IF;
    
    -- Создаем или обновляем подписку
    INSERT INTO public.user_subscriptions_2025_11_06_12_23 (
        email, 
        order_number, 
        status, 
        activated_at, 
        expires_at
    ) VALUES (
        p_email,
        'ADMIN_CREATED_' || extract(epoch from now())::text,
        'active',
        NOW(),
        NOW() + (plan_duration || ' days')::INTERVAL
    )
    ON CONFLICT (email) DO UPDATE SET
        status = 'active',
        activated_at = NOW(),
        expires_at = NOW() + (plan_duration || ' days')::INTERVAL,
        updated_at = NOW()
    RETURNING to_json(user_subscriptions_2025_11_06_12_23.*) INTO result_data;
    
    RETURN result_data;
END;
$$;