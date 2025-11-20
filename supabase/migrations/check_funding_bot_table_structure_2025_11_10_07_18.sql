-- Проверка структуры таблицы funding_bot_settings_2025_11_09_06_55
-- Имя: check_funding_bot_table_structure_2025_11_10_07_18

-- Показываем структуру таблицы funding_bot_settings_2025_11_09_06_55
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'funding_bot_settings_2025_11_09_06_55' 
AND table_schema = 'public'
ORDER BY ordinal_position;