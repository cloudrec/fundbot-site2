-- Удаляем подписку у простого пользователя
DELETE FROM user_subscriptions_dev 
WHERE user_id = '4c3f8b99-be12-4391-a8c2-9ae96a17b228' 
   OR email = 'stoksazarkh@gmail.com';

-- Проверяем что осталась только подписка админа
SELECT user_id, email, plan_name, status, expires_at 
FROM user_subscriptions_dev;