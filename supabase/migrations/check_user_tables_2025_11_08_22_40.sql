-- Проверяем какие таблицы содержат информацию о пользователях
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND (column_name LIKE '%user%' OR column_name LIKE '%email%')
ORDER BY table_name, ordinal_position;