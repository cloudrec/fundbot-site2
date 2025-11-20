-- Удаляем старое ограничение уникальности
ALTER TABLE public.api_keys_dev DROP CONSTRAINT IF EXISTS api_keys_dev_user_id_exchange_key;

-- Очищаем таблицу API ключей для чистого тестирования
DELETE FROM public.api_keys_dev;

-- Добавляем новое ограничение уникальности
ALTER TABLE public.api_keys_dev ADD CONSTRAINT api_keys_dev_user_exchange_unique UNIQUE (user_id, exchange);

-- Проверяем структуру таблицы
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'api_keys_dev' 
AND table_schema = 'public'
ORDER BY ordinal_position;