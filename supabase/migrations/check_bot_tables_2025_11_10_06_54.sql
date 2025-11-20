-- Проверка существующих таблиц для ботов
-- Имя: check_bot_tables_2025_11_10_06_54

-- Показываем все таблицы, связанные с ботами
SELECT 
    table_name,
    table_schema
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND (
    table_name LIKE '%bot%' 
    OR table_name LIKE '%funding%'
    OR table_name LIKE '%smart%'
    OR table_name LIKE '%trading%'
)
ORDER BY table_name;