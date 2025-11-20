-- Сначала проверим текущие ограничения
SELECT conname, pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'api_keys_dev'::regclass AND contype = 'c';

-- Удаляем старое ограничение если оно есть
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_dev_exchange_check') THEN
        ALTER TABLE api_keys_dev DROP CONSTRAINT api_keys_dev_exchange_check;
    END IF;
END $$;

-- Добавляем новое ограничение с поддержкой Gate.io
ALTER TABLE api_keys_dev ADD CONSTRAINT api_keys_dev_exchange_check 
CHECK (exchange IN ('binance', 'bybit', 'gate'));

-- Добавляем комментарий
COMMENT ON COLUMN api_keys_dev.exchange IS 'Поддерживаемые биржи: binance, bybit, gate';

-- Проверяем что изменения применились
SELECT conname, pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'api_keys_dev'::regclass AND contype = 'c';