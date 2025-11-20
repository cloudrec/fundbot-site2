-- Проверяем текущий статус пользователя
SELECT 
    u.id as user_id,
    u.email,
    u.created_at as registered_at,
    CASE WHEN a.user_id IS NOT NULL THEN a.role ELSE 'not_admin' END as admin_role,
    CASE WHEN s.user_id IS NOT NULL THEN s.status ELSE 'no_subscription' END as subscription_status
FROM auth.users u
LEFT JOIN public.admins_2025_11_06_12_23 a ON u.id = a.user_id
LEFT JOIN public.user_subscriptions_2025_11_06_12_23 s ON u.id = s.user_id
WHERE u.email = 'cloudkroter@gmail.com';

-- Принудительно добавляем как админа (если пользователь существует)
INSERT INTO public.admins_2025_11_06_12_23 (user_id, email, role)
SELECT u.id, u.email, 'super_admin'
FROM auth.users u
WHERE u.email = 'cloudkroter@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET
    role = 'super_admin',
    updated_at = NOW();

-- Принудительно даем активную подписку
INSERT INTO public.user_subscriptions_2025_11_06_12_23 (
    user_id, email, order_number, status, activated_at, expires_at
)
SELECT 
    u.id,
    u.email,
    'ADMIN_LIFETIME_' || extract(epoch from now())::text,
    'active',
    NOW(),
    NOW() + INTERVAL '10 years'
FROM auth.users u
WHERE u.email = 'cloudkroter@gmail.com'
ON CONFLICT (email) DO UPDATE SET
    status = 'active',
    activated_at = NOW(),
    expires_at = NOW() + INTERVAL '10 years',
    updated_at = NOW();

-- Проверяем результат еще раз
SELECT 
    u.id as user_id,
    u.email,
    a.role as admin_role,
    a.created_at as admin_since,
    s.status as subscription_status,
    s.expires_at as subscription_expires
FROM auth.users u
LEFT JOIN public.admins_2025_11_06_12_23 a ON u.id = a.user_id
LEFT JOIN public.user_subscriptions_2025_11_06_12_23 s ON u.id = s.user_id
WHERE u.email = 'cloudkroter@gmail.com';

-- Также проверим функцию is_admin
SELECT public.is_admin(u.id) as is_admin_result
FROM auth.users u
WHERE u.email = 'cloudkroter@gmail.com';