-- Добавляем уникальный индекс для user_id в таблице user_subscriptions_dev
-- Это позволит использовать upsert без ошибок

-- Сначала удаляем дубликаты если есть
DELETE FROM user_subscriptions_dev 
WHERE id NOT IN (
  SELECT MIN(id) 
  FROM user_subscriptions_dev 
  GROUP BY user_id
);

-- Добавляем уникальный индекс
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_dev_user_id_unique 
ON user_subscriptions_dev(user_id);

-- Альтернативно можно добавить уникальное ограничение
ALTER TABLE user_subscriptions_dev 
ADD CONSTRAINT user_subscriptions_dev_user_id_key 
UNIQUE (user_id);