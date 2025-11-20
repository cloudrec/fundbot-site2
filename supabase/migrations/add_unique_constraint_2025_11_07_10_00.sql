-- Добавляем уникальное ограничение для user_id в таблице user_subscriptions_dev
-- Это позволит использовать upsert без ошибок

-- Сначала удаляем дубликаты если есть
DELETE FROM user_subscriptions_dev a
USING user_subscriptions_dev b
WHERE a.id > b.id 
AND a.user_id = b.user_id;

-- Добавляем уникальное ограничение (без IF NOT EXISTS)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_subscriptions_dev_user_id_key'
    ) THEN
        ALTER TABLE user_subscriptions_dev 
        ADD CONSTRAINT user_subscriptions_dev_user_id_key UNIQUE (user_id);
    END IF;
END $$;