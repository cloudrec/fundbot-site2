-- Проверяем структуру таблицы trading_settings
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'trading_settings' 
ORDER BY ordinal_position;