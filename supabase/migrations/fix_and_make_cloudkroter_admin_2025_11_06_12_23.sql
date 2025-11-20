-- Добавление уникального ключа для email в таблице подписок
ALTER TABLE public.user_subscriptions_2025_11_06_12_23 
ADD CONSTRAINT unique_email UNIQUE (email);

-- Добавление cloudkroter@gmail.com как администратора
DO $$
DECLARE
    admin_user_id UUID;
    admin_email TEXT := 'cloudkroter@gmail.com';
BEGIN
    -- Ищем пользователя по email
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = admin_email;
    
    -- Если пользователь найден, добавляем его как админа
    IF admin_user_id IS NOT NULL THEN
        -- Добавляем как администратора
        INSERT INTO public.admins_2025_11_06_12_23 (user_id, email, role)
        VALUES (admin_user_id, admin_email, 'super_admin')
        ON CONFLICT (user_id) DO UPDATE SET
            role = 'super_admin',
            updated_at = NOW();
        
        RAISE NOTICE 'Admin added successfully for email: %', admin_email;
        
        -- Удаляем существующую подписку если есть
        DELETE FROM public.user_subscriptions_2025_11_06_12_23 
        WHERE email = admin_email OR user_id = admin_user_id;
        
        -- Добавляем пожизненную подписку администратору
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
            
        RAISE NOTICE 'Lifetime subscription granted to admin: %', admin_email;
    ELSE
        RAISE NOTICE 'User not found with email: %. Please register first with this email.', admin_email;
    END IF;
END $$;

-- Проверяем результат
SELECT 
    u.email,
    CASE WHEN a.user_id IS NOT NULL THEN a.role ELSE 'not_admin' END as admin_role,
    CASE WHEN a.user_id IS NOT NULL THEN a.created_at ELSE NULL END as admin_since,
    CASE WHEN s.user_id IS NOT NULL THEN s.status ELSE 'no_subscription' END as subscription_status,
    CASE WHEN s.user_id IS NOT NULL THEN s.expires_at ELSE NULL END as subscription_expires
FROM auth.users u
LEFT JOIN public.admins_2025_11_06_12_23 a ON u.id = a.user_id
LEFT JOIN public.user_subscriptions_2025_11_06_12_23 s ON u.id = s.user_id
WHERE u.email = 'cloudkroter@gmail.com';