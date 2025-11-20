-- Добавляем тарифные планы по умолчанию
INSERT INTO public.pricing_plans_2025_11_06_12_23 (plan_id, name, price, currency, duration_days, features, is_active)
VALUES 
    ('basic_monthly', 'Базовый (1 месяц)', 29.99, 'USD', 30, 
     ARRAY['Доступ ко всем биржам', 'Автоматическая торговля', 'Telegram уведомления', 'Техническая поддержка'], 
     true),
    
    ('pro_quarterly', 'Профессиональный (3 месяца)', 79.99, 'USD', 90, 
     ARRAY['Все функции базового плана', 'Приоритетная поддержка', 'Расширенная аналитика', 'Скидка 11%'], 
     true),
     
    ('premium_yearly', 'Премиум (1 год)', 299.99, 'USD', 365, 
     ARRAY['Все функции профессионального плана', 'VIP поддержка', 'Персональные настройки', 'Скидка 17%'], 
     true)
ON CONFLICT (plan_id) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    currency = EXCLUDED.currency,
    duration_days = EXCLUDED.duration_days,
    features = EXCLUDED.features,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Проверяем созданные планы
SELECT * FROM public.pricing_plans_2025_11_06_12_23 ORDER BY price;