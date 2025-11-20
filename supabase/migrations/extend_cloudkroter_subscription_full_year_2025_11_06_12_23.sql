-- Удаляем старую подписку
DELETE FROM public.user_subscriptions_2025_11_06_12_23 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'cloudkroter@gmail.com');

-- Добавляем новую подписку на полный год (365 дней от сегодня)
INSERT INTO public.user_subscriptions_2025_11_06_12_23 (
    user_id, email, amount, currency, status, expires_at, created_at, updated_at
) VALUES (
    (SELECT id FROM auth.users WHERE email = 'cloudkroter@gmail.com'),
    'cloudkroter@gmail.com',
    0,
    'USD',
    'active',
    '2025-11-06'::date + INTERVAL '365 days', -- До 6 ноября 2026
    NOW(),
    NOW()
);

-- Проверяем результат
SELECT 
    s.status,
    s.expires_at,
    s.expires_at::date - CURRENT_DATE as days_remaining,
    u.email 
FROM public.user_subscriptions_2025_11_06_12_23 s
JOIN auth.users u ON s.user_id = u.id
WHERE u.email = 'cloudkroter@gmail.com';