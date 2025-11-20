-- Проверяем все API ключи пользователя
SELECT 
    id,
    user_id,
    exchange,
    CASE 
        WHEN api_key IS NOT NULL AND LENGTH(api_key) > 0 THEN 'YES (' || LENGTH(api_key) || ' chars)'
        ELSE 'NO'
    END as has_api_key,
    CASE 
        WHEN api_secret IS NOT NULL AND LENGTH(api_secret) > 0 THEN 'YES (' || LENGTH(api_secret) || ' chars)'
        ELSE 'NO'
    END as has_api_secret,
    is_testnet,
    created_at,
    updated_at
FROM user_api_keys 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4'
ORDER BY exchange;