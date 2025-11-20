-- Делаем поле email необязательным или убираем его
ALTER TABLE user_subscriptions_dev 
ALTER COLUMN email DROP NOT NULL;

-- Или если поле email не нужно, можем его удалить
-- ALTER TABLE user_subscriptions_dev DROP COLUMN IF EXISTS email;

-- Проверяем структуру таблицы
SELECT column_name, is_nullable, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_subscriptions_dev' 
ORDER BY ordinal_position;