-- Проверяем все значения exchange
SELECT exchange, COUNT(*) as count
FROM api_keys_dev 
GROUP BY exchange;

-- Обновляем некорректные значения если они есть
UPDATE api_keys_dev 
SET exchange = LOWER(exchange)
WHERE exchange != LOWER(exchange);

-- Удаляем старое ограничение
ALTER TABLE api_keys_dev DROP CONSTRAINT IF EXISTS api_keys_dev_exchange_check;

-- Добавляем новое ограничение с Gate.io (без ограничения пока)
-- ALTER TABLE api_keys_dev ADD CONSTRAINT api_keys_dev_exchange_check 
-- CHECK (exchange IN ('binance', 'bybit', 'gate'));

-- Проверяем финальные значения
SELECT DISTINCT exchange, COUNT(*) as count
FROM api_keys_dev 
GROUP BY exchange
ORDER BY exchange;