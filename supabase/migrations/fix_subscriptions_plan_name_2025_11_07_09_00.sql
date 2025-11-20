-- Добавляем отсутствующую колонку plan_name в таблицу user_subscriptions_dev
ALTER TABLE user_subscriptions_dev 
ADD COLUMN IF NOT EXISTS plan_name TEXT;

-- Обновляем существующие записи
UPDATE user_subscriptions_dev 
SET plan_name = CASE 
  WHEN plan_id = 'starter_weekly' THEN 'Стартер'
  WHEN plan_id = 'pro_monthly' THEN 'Про'
  WHEN plan_id = 'premium_yearly' THEN 'Премиум'
  ELSE 'Неизвестный план'
END
WHERE plan_name IS NULL;