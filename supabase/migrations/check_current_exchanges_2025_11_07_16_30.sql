-- Проверяем текущие значения в поле exchange
SELECT DISTINCT exchange, COUNT(*) as count
FROM api_keys_dev 
GROUP BY exchange;

-- Проверяем все записи
SELECT id, user_id, exchange, is_active, created_at
FROM api_keys_dev 
ORDER BY created_at DESC;