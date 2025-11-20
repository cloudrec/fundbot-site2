-- Исправляем уникальный индекс для user_id в таблице user_subscriptions_dev
-- Это позволит использовать upsert без ошибок

-- Сначала удаляем дубликаты если есть (исправленная версия)
DELETE FROM user_subscriptions_dev a
USING user_subscriptions_dev b
WHERE a.id > b.id 
AND a.user_id = b.user_id;

-- Добавляем уникальное ограничение
ALTER TABLE user_subscriptions_dev 
ADD CONSTRAINT IF NOT EXISTS user_subscriptions_dev_user_id_key 
UNIQUE (user_id);