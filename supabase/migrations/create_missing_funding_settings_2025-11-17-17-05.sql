-- Создаем недостающую таблицу настроек фандинг бота
CREATE TABLE IF NOT EXISTS funding_bot_settings_2025_11_16_15_00 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  min_funding_rate DECIMAL DEFAULT 0.01,
  max_leverage INTEGER DEFAULT 10,
  max_positions INTEGER DEFAULT 5,
  min_volume_usd DECIMAL DEFAULT 100000,
  auto_trading BOOLEAN DEFAULT false,
  auto_scan BOOLEAN DEFAULT true,
  enabled_exchanges TEXT[] DEFAULT ARRAY['binance', 'bybit', 'okx', 'gate', 'kucoin', 'huobi', 'mexc', 'bitget'],
  telegram_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS политики
ALTER TABLE funding_bot_settings_2025_11_16_15_00 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own funding settings" ON funding_bot_settings_2025_11_16_15_00
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own funding settings" ON funding_bot_settings_2025_11_16_15_00
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own funding settings" ON funding_bot_settings_2025_11_16_15_00
  FOR UPDATE USING (auth.uid() = user_id);

-- Функция для создания настроек по умолчанию
CREATE OR REPLACE FUNCTION create_default_funding_settings_2025_11_16_15_00()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO funding_bot_settings_2025_11_16_15_00 (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер для создания настроек при регистрации
CREATE OR REPLACE TRIGGER create_funding_settings_trigger_2025_11_16_15_00
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_funding_settings_2025_11_16_15_00();
