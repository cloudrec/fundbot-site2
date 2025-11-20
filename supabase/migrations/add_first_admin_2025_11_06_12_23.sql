-- Добавление первого администратора
-- ВАЖНО: Замените 'your-email@example.com' на ваш реальный email

-- Сначала найдем пользователя по email (замените на ваш email)
DO $$
DECLARE
    admin_user_id UUID;
    admin_email TEXT := 'your-email@example.com'; -- ЗАМЕНИТЕ НА ВАШ EMAIL
BEGIN
    -- Ищем пользователя по email
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = admin_email;
    
    -- Если пользователь найден, добавляем его как админа
    IF admin_user_id IS NOT NULL THEN
        INSERT INTO public.admins_2025_11_06_12_23 (user_id, email, role)
        VALUES (admin_user_id, admin_email, 'super_admin')
        ON CONFLICT (user_id) DO NOTHING;
        
        RAISE NOTICE 'Admin added successfully for email: %', admin_email;
    ELSE
        RAISE NOTICE 'User not found with email: %. Please register first.', admin_email;
    END IF;
END $$;

-- Проверяем список администраторов
SELECT a.email, a.role, a.created_at 
FROM public.admins_2025_11_06_12_23 a
JOIN auth.users u ON a.user_id = u.id;