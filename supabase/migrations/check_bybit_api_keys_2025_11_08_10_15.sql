-- Проверяем API ключи для Bybit
SELECT 
    exchange,
    LENGTH(api_key) as api_key_length,
    LENGTH(api_secret) as api_secret_length,
    CASE WHEN passphrase IS NOT NULL THEN LENGTH(passphrase) ELSE 0 END as passphrase_length,
    is_testnet,
    is_active,
    created_at
FROM api_keys_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4'
AND exchange = 'bybit'
ORDER BY created_at DESC;