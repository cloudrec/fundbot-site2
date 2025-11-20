-- Создаем таблицы для боевого сканера фандингов

-- Таблица настроек сканера
CREATE TABLE IF NOT EXISTS funding_scanner_settings_2025_11_17_16_55 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  min_funding_rate DECIMAL DEFAULT 0.3,
  max_funding_rate DECIMAL DEFAULT 10.0,
  scan_interval_minutes INTEGER DEFAULT 60,
  telegram_notifications BOOLEAN DEFAULT true,
  auto_scan_enabled BOOLEAN DEFAULT true,
  min_volume_24h BIGINT DEFAULT 1000000,
  enabled_exchanges TEXT[] DEFAULT ARRAY['Binance', 'Bybit', 'OKX', 'Gate.io', 'KuCoin', 'Huobi', 'MEXC', 'Bitget'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица результатов сканирования
CREATE TABLE IF NOT EXISTS funding_scan_results_2025_11_17_16_55 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id UUID DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  funding_rate DECIMAL NOT NULL,
  annual_rate DECIMAL,
  mark_price DECIMAL,
  next_funding_time TIMESTAMP WITH TIME ZONE,
  volume_24h BIGINT,
  pair_url TEXT,
  scan_type TEXT DEFAULT 'auto',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица статистики сканирования
CREATE TABLE IF NOT EXISTS funding_scan_stats_2025_11_17_16_55 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL,
  total_exchanges INTEGER DEFAULT 0,
  total_symbols INTEGER DEFAULT 0,
  positive_funding_count INTEGER DEFAULT 0,
  negative_funding_count INTEGER DEFAULT 0,
  scan_duration INTEGER DEFAULT 0,
  scan_type TEXT DEFAULT 'auto',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS политики
ALTER TABLE funding_scanner_settings_2025_11_17_16_55 ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_scan_results_2025_11_17_16_55 ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_scan_stats_2025_11_17_16_55 ENABLE ROW LEVEL SECURITY;

-- Политики для настроек
CREATE POLICY Users can view own settings ON funding_scanner_settings_2025_11_17_16_55
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY Users can insert own settings ON funding_scanner_settings_2025_11_17_16_55
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY Users can update own settings ON funding_scanner_settings_2025_11_17_16_55
  FOR UPDATE USING (auth.uid() = user_id);

-- Политики для результатов
CREATE POLICY Users can view own results ON funding_scan_results_2025_11_17_16_55
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY Users can insert own results ON funding_scan_results_2025_11_17_16_55
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Политики для статистики
CREATE POLICY Users can view own stats ON funding_scan_stats_2025_11_17_16_55
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY Users can insert own stats ON funding_scan_stats_2025_11_17_16_55
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Функция для создания настроек по умолчанию
CREATE OR REPLACE FUNCTION create_default_funding_settings_2025_11_17_16_55()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO funding_scanner_settings_2025_11_17_16_55 (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер для создания настроек при регистрации
CREATE OR REPLACE TRIGGER create_funding_settings_trigger_2025_11_17_16_55
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_funding_settings_2025_11_17_16_55();

-- Функция очистки старых результатов (старше 7 дней)
CREATE OR REPLACE FUNCTION cleanup_old_funding_results_2025_11_17_16_55()
RETURNS void AS $$
BEGIN
  DELETE FROM funding_scan_results_2025_11_17_16_55 
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  DELETE FROM funding_scan_stats_2025_11_17_16_55 
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
