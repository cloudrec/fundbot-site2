-- Отключаем RLS для тарифных планов (админы должны видеть все)
ALTER TABLE public.pricing_plans_2025_11_06_12_23 DISABLE ROW LEVEL SECURITY;

-- Проверяем существующие планы
SELECT * FROM public.pricing_plans_2025_11_06_12_23;

-- Если планов нет, добавляем их
INSERT INTO public.pricing_plans_2025_11_06_12_23 (plan_id, name, price, currency, duration_days, features, is_active)
VALUES 
    ('starter_weekly', 'Стартер (1 неделя)', 9.99, 'USD', 7, 
     '["Тестовый доступ", "Базовые функции", "Email поддержка"]'::jsonb, 
     true),
    ('basic_monthly', 'Базовый (1 месяц)', 29.99, 'USD', 30, 
     '["Доступ ко всем биржам", "Автоматическая торговля", "Telegram уведомления", "Техническая поддержка"]'::jsonb, 
     true),
    ('pro_quarterly', 'Профессиональный (3 месяца)', 79.99, 'USD', 90, 
     '["Все функции базового плана", "Приоритетная поддержка", "Расширенная аналитика", "Скидка 11%"]'::jsonb, 
     true),
    ('premium_yearly', 'Премиум (1 год)', 299.99, 'USD', 365, 
     '["Все функции профессионального плана", "VIP поддержка", "Персональные настройки", "Скидка 17%"]'::jsonb, 
     true)
ON CONFLICT (plan_id) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    features = EXCLUDED.features,
    is_active = EXCLUDED.is_active;

-- Создаем функцию для создания нового тарифа
CREATE OR REPLACE FUNCTION public.create_pricing_plan(
    p_plan_id TEXT,
    p_name TEXT,
    p_price NUMERIC,
    p_currency TEXT DEFAULT 'USD',
    p_duration_days INTEGER DEFAULT 30,
    p_features JSONB DEFAULT '[]'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result_data JSON;
BEGIN
    INSERT INTO public.pricing_plans_2025_11_06_12_23 (
        plan_id, name, price, currency, duration_days, features, is_active
    ) VALUES (
        p_plan_id, p_name, p_price, p_currency, p_duration_days, p_features, true
    ) RETURNING to_json(pricing_plans_2025_11_06_12_23.*) INTO result_data;
    
    RETURN result_data;
END;
$$;

-- Проверяем финальный результат
SELECT plan_id, name, price, duration_days, is_active 
FROM public.pricing_plans_2025_11_06_12_23 
ORDER BY price;