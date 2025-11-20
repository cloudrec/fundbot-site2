-- Проверяем структуру таблицы
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'trading_settings_dev' 
ORDER BY ordinal_position;

-- Проверяем текущие данные
SELECT * FROM trading_settings_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';