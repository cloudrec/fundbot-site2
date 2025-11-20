-- Проверяем существующие тарифные планы
SELECT * FROM public.pricing_plans_2025_11_06_12_23;

-- Если планов нет, добавляем их заново
INSERT INTO public.pricing_plans_2025_11_06_12_23 (plan_id, name, price, currency, duration_days, features, is_active)
VALUES 
    ('basic_monthly', 'Базовый (1 месяц)', 29.99, 'USD', 30, 
     '["Доступ ко всем биржам", "Автоматическая торговля", "Telegram уведомления", "Техническая поддержка"]'::jsonb, 
     true),
    
    ('pro_quarterly', 'Профессиональный (3 месяца)', 79.99, 'USD', 90, 
     '["Все функции базового плана", "Приоритетная поддержка", "Расширенная аналитика", "Скидка 11%"]'::jsonb, 
     true),
     
    ('premium_yearly', 'Премиум (1 год)', 299.99, 'USD', 365, 
     '["Все функции профессионального плана", "VIP поддержка", "Персональные настройки", "Скидка 17%"]'::jsonb, 
     true),
     
    ('starter_weekly', 'Стартер (1 неделя)', 9.99, 'USD', 7, 
     '["Тестовый доступ", "Базовые функции", "Email поддержка"]'::jsonb, 
     true)
ON CONFLICT (plan_id) DO NOTHING;

-- Проверяем результат
SELECT plan_id, name, price, duration_days, is_active FROM public.pricing_plans_2025_11_06_12_23 ORDER BY price;

-- Также проверим настройки для cloudkroter@gmail.com
SELECT ts.*, u.email 
FROM public.trading_settings_2025_11_06_12_23 ts
JOIN auth.users u ON ts.user_id = u.id
WHERE u.email = 'cloudkroter@gmail.com';