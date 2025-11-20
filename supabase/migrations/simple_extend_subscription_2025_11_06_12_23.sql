-- Удаляем старые подписки для cloudkroter@gmail.com
DELETE FROM public.user_subscriptions_2025_11_06_12_23 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'cloudkroter@gmail.com');

-- Добавляем новую подписку на 365 дней
INSERT INTO public.user_subscriptions_2025_11_06_12_23 (
    user_id, email, amount, currency, status, expires_at
) VALUES (
    (SELECT id FROM auth.users WHERE email = 'cloudkroter@gmail.com'),
    'cloudkroter@gmail.com',
    0,
    'USD',
    'active',
    NOW() + INTERVAL '365 days'
);

-- Проверяем результат
SELECT s.*, u.email 
FROM public.user_subscriptions_2025_11_06_12_23 s
JOIN auth.users u ON s.user_id = u.id
WHERE u.email = 'cloudkroter@gmail.com';