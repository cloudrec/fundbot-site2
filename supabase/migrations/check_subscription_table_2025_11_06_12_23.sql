-- Проверяем структуру таблицы подписок
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_subscriptions_2025_11_06_12_23' 
AND table_schema = 'public';

-- Простое продление подписки для cloudkroter@gmail.com
INSERT INTO public.user_subscriptions_2025_11_06_12_23 (
    user_id, email, amount, currency, status, expires_at
) VALUES (
    (SELECT id FROM auth.users WHERE email = 'cloudkroter@gmail.com'),
    'cloudkroter@gmail.com',
    0,
    'USD',
    'active',
    NOW() + INTERVAL '365 days'
) ON CONFLICT (user_id) DO UPDATE SET
    expires_at = NOW() + INTERVAL '365 days',
    status = 'active',
    updated_at = NOW();

-- Проверяем результат
SELECT s.*, u.email 
FROM public.user_subscriptions_2025_11_06_12_23 s
JOIN auth.users u ON s.user_id = u.id
WHERE u.email = 'cloudkroter@gmail.com';