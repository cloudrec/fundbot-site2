-- Добавляем Gate.io в список поддерживаемых бирж
-- Обновляем ограничение для поля exchange в таблице api_keys_dev

-- Удаляем старое ограничение
ALTER TABLE api_keys_dev DROP CONSTRAINT IF EXISTS api_keys_dev_exchange_check;

-- Добавляем новое ограничение с Gate.io
ALTER TABLE api_keys_dev ADD CONSTRAINT api_keys_dev_exchange_check 
CHECK (exchange IN ('binance', 'bybit', 'gate'));

-- Добавляем комментарий
COMMENT ON COLUMN api_keys_dev.exchange IS 'Поддерживаемые биржи: binance, bybit, gate';

-- Проверяем что изменения применились
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'api_keys_dev' AND column_name = 'exchange';