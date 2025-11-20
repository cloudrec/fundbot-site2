-- Создаем основные таблицы для торгового бота
CREATE TABLE IF NOT EXISTS profiles_new (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trading_settings_new (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL CHECK (exchange IN ('bybit', 'binance', 'gate', 'kucoin', 'okx', 'mexc')),
  base_asset TEXT DEFAULT 'BTC',
  quote_asset TEXT DEFAULT 'USDT',
  order_amount_usd DECIMAL DEFAULT 100,
  leverage INTEGER DEFAULT 10,
  take_profit_percent DECIMAL DEFAULT 0.3,
  stop_loss_percent DECIMAL DEFAULT 2.0,
  enabled_exchanges JSONB DEFAULT '{"bybit": true, "binance": true, "gate": true, "kucoin": true, "okx": true, "mexc": false}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, exchange)
);

CREATE TABLE IF NOT EXISTS api_keys_new (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL CHECK (exchange IN ('bybit', 'binance', 'gate', 'kucoin', 'okx', 'mexc')),
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL,
  passphrase TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, exchange)
);

-- RLS политики
ALTER TABLE profiles_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_settings_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys_new ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles_new FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can manage own trading settings" ON trading_settings_new FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own API keys" ON api_keys_new FOR ALL USING (auth.uid() = user_id);
