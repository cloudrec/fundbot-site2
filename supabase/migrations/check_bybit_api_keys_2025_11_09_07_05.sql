-- Проверяем Bybit API ключи для пользователя
SELECT 
    user_id, 
    exchange, 
    LENGTH(api_key) as api_key_length,
    LENGTH(api_secret) as api_secret_length,
    SUBSTRING(api_key, 1, 10) as api_key_start,
    created_at,
    updated_at
FROM api_keys_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4' 
AND exchange = 'bybit';

-- Проверяем все API ключи пользователя
SELECT 
    user_id, 
    exchange, 
    LENGTH(api_key) as api_key_length,
    LENGTH(api_secret) as api_secret_length,
    created_at
FROM api_keys_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4'
ORDER BY exchange;