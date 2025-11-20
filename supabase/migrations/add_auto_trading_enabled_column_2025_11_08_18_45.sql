-- Добавление недостающей колонки auto_trading_enabled
ALTER TABLE trading_settings 
ADD COLUMN IF NOT EXISTS auto_trading_enabled BOOLEAN DEFAULT false;

-- Проверяем структуру таблицы
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'trading_settings' 
ORDER BY ordinal_position;