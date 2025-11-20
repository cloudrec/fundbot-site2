-- Проверяем структуру таблицы user_api_keys
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_api_keys' 
ORDER BY ordinal_position;