-- Создаем подписку для админа для тестирования
INSERT INTO user_subscriptions_dev (
  user_id,
  email,
  plan_id,
  plan_name,
  amount,
  currency,
  status,
  expires_at,
  created_at,
  updated_at
) VALUES (
  'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4',
  'cloudkroter@gmail.com',
  'admin_test',
  'Админ Тест',
  0.00,
  'USD',
  'active',
  '2026-11-07T10:00:00.000Z',
  NOW(),
  NOW()
) ON CONFLICT (user_id) DO UPDATE SET
  plan_name = 'Админ Тест',
  status = 'active',
  expires_at = '2026-11-07T10:00:00.000Z',
  updated_at = NOW();