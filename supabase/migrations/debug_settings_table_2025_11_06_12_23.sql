-- Проверяем структуру таблицы настроек
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'trading_settings_2025_11_06_12_23' 
ORDER BY ordinal_position;

-- Проверяем существующие данные
SELECT * FROM public.trading_settings_2025_11_06_12_23 LIMIT 5;

-- Проверяем RLS политики
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'trading_settings_2025_11_06_12_23';