-- Принудительная активация для cloudkroter@gmail.com
DO $$
DECLARE
    admin_user_id UUID;
    admin_email TEXT := 'cloudkroter@gmail.com';
BEGIN
    -- Находим пользователя
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = admin_email;
    
    IF admin_user_id IS NOT NULL THEN
        -- Удаляем старые записи
        DELETE FROM public.admins_2025_11_06_12_23 WHERE user_id = admin_user_id;
        DELETE FROM public.user_subscriptions_2025_11_06_12_23 WHERE user_id = admin_user_id;
        
        -- Добавляем как супер-админа
        INSERT INTO public.admins_2025_11_06_12_23 (user_id, email, role)
        VALUES (admin_user_id, admin_email, 'super_admin');
        
        -- Даем пожизненную подписку
        INSERT INTO public.user_subscriptions_2025_11_06_12_23 (
            user_id, email, order_number, status, activated_at, expires_at
        ) VALUES (
            admin_user_id,
            admin_email,
            'ADMIN_LIFETIME_' || extract(epoch from now())::text,
            'active',
            NOW(),
            NOW() + INTERVAL '10 years'
        );
        
        RAISE NOTICE 'SUCCESS: Admin and subscription activated for %', admin_email;
    ELSE
        RAISE NOTICE 'ERROR: User not found with email %', admin_email;
    END IF;
END $$;

-- Проверяем результат
SELECT 
    u.email,
    u.id as user_id,
    CASE WHEN a.user_id IS NOT NULL THEN a.role ELSE 'not_admin' END as admin_role,
    CASE WHEN s.user_id IS NOT NULL THEN s.status ELSE 'no_subscription' END as subscription_status,
    CASE WHEN s.user_id IS NOT NULL THEN s.expires_at ELSE NULL END as expires_at,
    public.is_admin(u.id) as is_admin_function_result,
    public.check_user_subscription(u.id) as subscription_check_result
FROM auth.users u
LEFT JOIN public.admins_2025_11_06_12_23 a ON u.id = a.user_id
LEFT JOIN public.user_subscriptions_2025_11_06_12_23 s ON u.id = s.user_id
WHERE u.email = 'cloudkroter@gmail.com';