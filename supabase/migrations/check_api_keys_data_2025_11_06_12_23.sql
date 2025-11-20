-- Проверяем что хранится в таблице API ключей
SELECT 
    id,
    user_id,
    exchange,
    LEFT(api_key, 10) || '...' as api_key_preview,
    LEFT(api_secret, 10) || '...' as api_secret_preview,
    created_at
FROM public.api_keys_2025_11_06_12_23
ORDER BY created_at DESC
LIMIT 5;

-- Проверяем связь с пользователями
SELECT 
    ak.exchange,
    u.email,
    LEFT(ak.api_key, 10) || '...' as api_key_preview
FROM public.api_keys_2025_11_06_12_23 ak
JOIN auth.users u ON ak.user_id = u.id
WHERE u.email = 'cloudkroter@gmail.com';