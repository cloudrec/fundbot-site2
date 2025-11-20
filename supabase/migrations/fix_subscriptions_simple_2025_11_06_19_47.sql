-- Очищаем все подписки для простого пользователя
DELETE FROM user_subscriptions_dev WHERE user_id != 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';

-- Создаем простую функцию проверки подписки
CREATE OR REPLACE FUNCTION check_user_subscription_simple_2025_11_06_19_47(p_user_id UUID)
RETURNS TABLE(
  has_subscription BOOLEAN,
  plan_name TEXT,
  expires_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Проверяем есть ли активная подписка
  RETURN QUERY
  SELECT 
    CASE WHEN COUNT(*) > 0 THEN TRUE ELSE FALSE END as has_subscription,
    COALESCE(MAX(plan_id), 'free') as plan_name,
    MAX(expires_at) as expires_at
  FROM user_subscriptions_dev 
  WHERE user_id = p_user_id 
    AND status = 'active' 
    AND expires_at > NOW();
    
  -- Если нет результатов, возвращаем false
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'free'::TEXT, NULL::TIMESTAMPTZ;
  END IF;
END;
$$;