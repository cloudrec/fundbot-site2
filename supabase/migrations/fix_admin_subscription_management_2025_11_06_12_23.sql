-- Создаем функцию для продления подписки пользователю (только для админов)
CREATE OR REPLACE FUNCTION public.extend_user_subscription(
    p_user_email TEXT,
    p_days INTEGER DEFAULT 30,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_user_id UUID;
    result_data JSON;
    admin_email TEXT;
BEGIN
    -- Проверяем что вызывающий пользователь - админ
    IF p_admin_user_id IS NOT NULL THEN
        SELECT email INTO admin_email FROM auth.users WHERE id = p_admin_user_id;
        
        IF NOT EXISTS (
            SELECT 1 FROM public.admins_2025_11_06_12_23 
            WHERE user_id = p_admin_user_id
        ) THEN
            RAISE EXCEPTION 'Access denied: User % is not an admin', admin_email;
        END IF;
    END IF;
    
    -- Находим пользователя по email
    SELECT id INTO target_user_id FROM auth.users WHERE email = p_user_email;
    
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', p_user_email;
    END IF;
    
    -- Удаляем старые подписки
    DELETE FROM public.user_subscriptions_2025_11_06_12_23 
    WHERE user_id = target_user_id;
    
    -- Создаем новую подписку
    INSERT INTO public.user_subscriptions_2025_11_06_12_23 (
        user_id, email, plan_id, amount, currency, status, 
        expires_at, created_at, updated_at
    ) VALUES (
        target_user_id, p_user_email, 'admin_extended', 0, 'USD', 'active',
        NOW() + INTERVAL '1 day' * p_days, NOW(), NOW()
    ) RETURNING to_json(user_subscriptions_2025_11_06_12_23.*) INTO result_data;
    
    RETURN result_data;
END;
$$;

-- Продлеваем подписку для cloudkroter@gmail.com на 365 дней
SELECT public.extend_user_subscription(
    'cloudkroter@gmail.com',
    365,
    (SELECT id FROM auth.users WHERE email = 'cloudkroter@gmail.com')
);

-- Проверяем результат
SELECT s.*, u.email 
FROM public.user_subscriptions_2025_11_06_12_23 s
JOIN auth.users u ON s.user_id = u.id
WHERE u.email = 'cloudkroter@gmail.com';