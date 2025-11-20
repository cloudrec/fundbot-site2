-- Обновляем таблицу для поддержки шорт настроек
ALTER TABLE trading_settings_dev 
ADD COLUMN IF NOT EXISTS short_tp_offset_percent DECIMAL(10,2) DEFAULT 0.3,
ADD COLUMN IF NOT EXISTS short_stop_loss_percent DECIMAL(10,2) DEFAULT 2.0;

-- Обновляем функцию сохранения настроек
CREATE OR REPLACE FUNCTION save_settings_simple_dev(
  p_user_id UUID,
  p_exchange TEXT DEFAULT 'bybit',
  p_base_asset TEXT DEFAULT 'BTC',
  p_quote_asset TEXT DEFAULT 'USDT',
  p_order_amount_usd DECIMAL DEFAULT 100,
  p_leverage INTEGER DEFAULT 10,
  p_take_profit_percent DECIMAL DEFAULT 0.5,
  p_stop_loss_percent DECIMAL DEFAULT 1.0,
  p_funding_delay_ms INTEGER DEFAULT 5000,
  p_order_timeout_minutes INTEGER DEFAULT 30,
  p_long_tp_offset_percent DECIMAL DEFAULT 0.3,
  p_long_stop_loss_percent DECIMAL DEFAULT 2.0,
  p_short_tp_offset_percent DECIMAL DEFAULT 0.3,
  p_short_stop_loss_percent DECIMAL DEFAULT 2.0,
  p_telegram_notifications BOOLEAN DEFAULT true,
  p_auto_trading_enabled BOOLEAN DEFAULT false
) RETURNS TEXT AS $$
BEGIN
  INSERT INTO trading_settings_dev (
    user_id, exchange, base_asset, quote_asset, order_amount_usd, leverage,
    take_profit_percent, stop_loss_percent, funding_delay_ms, order_timeout_minutes,
    long_tp_offset_percent, long_stop_loss_percent, 
    short_tp_offset_percent, short_stop_loss_percent,
    telegram_notifications, auto_trading_enabled, updated_at
  ) VALUES (
    p_user_id, p_exchange, p_base_asset, p_quote_asset, p_order_amount_usd, p_leverage,
    p_take_profit_percent, p_stop_loss_percent, p_funding_delay_ms, p_order_timeout_minutes,
    p_long_tp_offset_percent, p_long_stop_loss_percent,
    p_short_tp_offset_percent, p_short_stop_loss_percent,
    p_telegram_notifications, p_auto_trading_enabled, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    exchange = EXCLUDED.exchange,
    base_asset = EXCLUDED.base_asset,
    quote_asset = EXCLUDED.quote_asset,
    order_amount_usd = EXCLUDED.order_amount_usd,
    leverage = EXCLUDED.leverage,
    take_profit_percent = EXCLUDED.take_profit_percent,
    stop_loss_percent = EXCLUDED.stop_loss_percent,
    funding_delay_ms = EXCLUDED.funding_delay_ms,
    order_timeout_minutes = EXCLUDED.order_timeout_minutes,
    long_tp_offset_percent = EXCLUDED.long_tp_offset_percent,
    long_stop_loss_percent = EXCLUDED.long_stop_loss_percent,
    short_tp_offset_percent = EXCLUDED.short_tp_offset_percent,
    short_stop_loss_percent = EXCLUDED.short_stop_loss_percent,
    telegram_notifications = EXCLUDED.telegram_notifications,
    auto_trading_enabled = EXCLUDED.auto_trading_enabled,
    updated_at = NOW();

  RETURN 'SUCCESS: Saved ' || p_base_asset || '/' || p_quote_asset || ' for user ' || p_user_id || ' with SHORT settings';
END;
$$ LANGUAGE plpgsql;