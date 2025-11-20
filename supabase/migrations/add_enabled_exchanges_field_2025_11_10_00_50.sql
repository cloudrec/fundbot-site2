-- Добавляем поле enabled_exchanges в таблицу trading_settings_dev
-- Создано: 2025-11-10 00:50 UTC

-- Добавляем колонку для хранения активных бирж
ALTER TABLE trading_settings_dev 
ADD COLUMN IF NOT EXISTS enabled_exchanges JSONB DEFAULT '{"binance": true, "bybit": true, "gate": true, "okx": true, "kucoin": true, "mexc": true}';

-- Обновляем существующие записи значением по умолчанию
UPDATE trading_settings_dev 
SET enabled_exchanges = '{"binance": true, "bybit": true, "gate": true, "okx": true, "kucoin": true, "mexc": true}'
WHERE enabled_exchanges IS NULL;

-- Добавляем комментарий
COMMENT ON COLUMN trading_settings_dev.enabled_exchanges IS 'JSON объект с активными биржами для торговли';

-- Проверяем что поле добавлено
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'trading_settings_dev' 
AND column_name = 'enabled_exchanges';