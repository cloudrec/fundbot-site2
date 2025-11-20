-- Добавляем колонку для хранения активных бирж если её нет
ALTER TABLE trading_settings_new 
ADD COLUMN IF NOT EXISTS active_exchanges JSONB DEFAULT '{"bybit": true, "binance": true, "gate": true, "kucoin": true, "okx": true, "mexc": false}';

-- Создаем функцию для сохранения настроек активных бирж
CREATE OR REPLACE FUNCTION save_active_exchanges(
  p_user_id UUID,
  p_active_exchanges JSONB
) RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO trading_settings_new (user_id, active_exchanges, updated_at)
  VALUES (p_user_id, p_active_exchanges, NOW())
  ON CONFLICT (user_id, exchange) 
  DO UPDATE SET 
    active_exchanges = p_active_exchanges,
    updated_at = NOW();
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
