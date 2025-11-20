-- Удаляем старую функцию и создаем новую с поддержкой шорт настроек
DROP FUNCTION IF EXISTS load_trading_settings_dev(UUID);

-- Создаем новую функцию загрузки настроек
CREATE OR REPLACE FUNCTION load_trading_settings_dev(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  exchange TEXT,
  base_asset TEXT,
  quote_asset TEXT,
  order_amount_usd DECIMAL,
  leverage INTEGER,
  take_profit_percent DECIMAL,
  stop_loss_percent DECIMAL,
  funding_delay_ms INTEGER,
  order_timeout_minutes INTEGER,
  long_tp_offset_percent DECIMAL,
  long_stop_loss_percent DECIMAL,
  short_tp_offset_percent DECIMAL,
  short_stop_loss_percent DECIMAL,
  telegram_notifications BOOLEAN,
  auto_trading_enabled BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ts.id,
    ts.user_id,
    ts.exchange,
    ts.base_asset,
    ts.quote_asset,
    ts.order_amount_usd,
    ts.leverage,
    ts.take_profit_percent,
    ts.stop_loss_percent,
    ts.funding_delay_ms,
    ts.order_timeout_minutes,
    ts.long_tp_offset_percent,
    ts.long_stop_loss_percent,
    COALESCE(ts.short_tp_offset_percent, 0.3) as short_tp_offset_percent,
    COALESCE(ts.short_stop_loss_percent, 2.0) as short_stop_loss_percent,
    ts.telegram_notifications,
    ts.auto_trading_enabled,
    ts.created_at,
    ts.updated_at
  FROM trading_settings_dev ts
  WHERE ts.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;