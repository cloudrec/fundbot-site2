-- Добавляем недостающие колонки в таблицу api_keys_dev
ALTER TABLE api_keys_dev 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Проверяем структуру таблицы
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'api_keys_dev' 
ORDER BY ordinal_position;