-- Создаем отдельные таблицы для каждой биржи
-- Текущее время: 2025-11-10 20:30 UTC

-- 1. Таблица настроек для Binance
CREATE TABLE IF NOT EXISTS binance_settings_2025_11_10_20_30 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT DEFAULT 'BTCUSDT',
    leverage INTEGER DEFAULT 10,
    risk_percent DECIMAL(5,2) DEFAULT 2.00,
    long_tp DECIMAL(5,2) DEFAULT 2.00,
    long_sl DECIMAL(5,2) DEFAULT 1.00,
    short_tp DECIMAL(5,2) DEFAULT 2.00,
    short_sl DECIMAL(5,2) DEFAULT 1.00,
    min_order_size DECIMAL(10,2) DEFAULT 10.00,
    max_positions INTEGER DEFAULT 3,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2. Таблица настроек для Bybit
CREATE TABLE IF NOT EXISTS bybit_settings_2025_11_10_20_30 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT DEFAULT 'BTCUSDT',
    leverage INTEGER DEFAULT 10,
    risk_percent DECIMAL(5,2) DEFAULT 2.00,
    long_tp DECIMAL(5,2) DEFAULT 2.00,
    long_sl DECIMAL(5,2) DEFAULT 1.00,
    short_tp DECIMAL(5,2) DEFAULT 2.00,
    short_sl DECIMAL(5,2) DEFAULT 1.00,
    min_order_size DECIMAL(10,2) DEFAULT 1.00,
    max_positions INTEGER DEFAULT 3,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 3. Таблица настроек для Gate.io
CREATE TABLE IF NOT EXISTS gate_settings_2025_11_10_20_30 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT DEFAULT 'BTC_USDT',
    leverage INTEGER DEFAULT 10,
    risk_percent DECIMAL(5,2) DEFAULT 2.00,
    long_tp DECIMAL(5,2) DEFAULT 2.00,
    long_sl DECIMAL(5,2) DEFAULT 1.00,
    short_tp DECIMAL(5,2) DEFAULT 2.00,
    short_sl DECIMAL(5,2) DEFAULT 1.00,
    min_order_size DECIMAL(10,2) DEFAULT 5.00,
    max_positions INTEGER DEFAULT 3,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 4. Таблица настроек для OKX
CREATE TABLE IF NOT EXISTS okx_settings_2025_11_10_20_30 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT DEFAULT 'BTC-USDT-SWAP',
    leverage INTEGER DEFAULT 10,
    risk_percent DECIMAL(5,2) DEFAULT 2.00,
    long_tp DECIMAL(5,2) DEFAULT 2.00,
    long_sl DECIMAL(5,2) DEFAULT 1.00,
    short_tp DECIMAL(5,2) DEFAULT 2.00,
    short_sl DECIMAL(5,2) DEFAULT 1.00,
    min_order_size DECIMAL(10,2) DEFAULT 1.00,
    max_positions INTEGER DEFAULT 3,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 5. Таблица настроек для KuCoin
CREATE TABLE IF NOT EXISTS kucoin_settings_2025_11_10_20_30 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT DEFAULT 'XBTUSDTM',
    leverage INTEGER DEFAULT 10,
    risk_percent DECIMAL(5,2) DEFAULT 2.00,
    long_tp DECIMAL(5,2) DEFAULT 2.00,
    long_sl DECIMAL(5,2) DEFAULT 1.00,
    short_tp DECIMAL(5,2) DEFAULT 2.00,
    short_sl DECIMAL(5,2) DEFAULT 1.00,
    min_order_size DECIMAL(10,2) DEFAULT 1.00,
    max_positions INTEGER DEFAULT 3,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 6. Таблица настроек для MEXC
CREATE TABLE IF NOT EXISTS mexc_settings_2025_11_10_20_30 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT DEFAULT 'BTC_USDT',
    leverage INTEGER DEFAULT 10,
    risk_percent DECIMAL(5,2) DEFAULT 2.00,
    long_tp DECIMAL(5,2) DEFAULT 2.00,
    long_sl DECIMAL(5,2) DEFAULT 1.00,
    short_tp DECIMAL(5,2) DEFAULT 2.00,
    short_sl DECIMAL(5,2) DEFAULT 1.00,
    min_order_size DECIMAL(10,2) DEFAULT 1.00,
    max_positions INTEGER DEFAULT 3,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Создаем RLS политики для всех таблиц
ALTER TABLE binance_settings_2025_11_10_20_30 ENABLE ROW LEVEL SECURITY;
ALTER TABLE bybit_settings_2025_11_10_20_30 ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_settings_2025_11_10_20_30 ENABLE ROW LEVEL SECURITY;
ALTER TABLE okx_settings_2025_11_10_20_30 ENABLE ROW LEVEL SECURITY;
ALTER TABLE kucoin_settings_2025_11_10_20_30 ENABLE ROW LEVEL SECURITY;
ALTER TABLE mexc_settings_2025_11_10_20_30 ENABLE ROW LEVEL SECURITY;

-- RLS политики для Binance
CREATE POLICY "Users can view own binance settings" ON binance_settings_2025_11_10_20_30
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own binance settings" ON binance_settings_2025_11_10_20_30
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own binance settings" ON binance_settings_2025_11_10_20_30
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS политики для Bybit
CREATE POLICY "Users can view own bybit settings" ON bybit_settings_2025_11_10_20_30
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bybit settings" ON bybit_settings_2025_11_10_20_30
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bybit settings" ON bybit_settings_2025_11_10_20_30
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS политики для Gate.io
CREATE POLICY "Users can view own gate settings" ON gate_settings_2025_11_10_20_30
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gate settings" ON gate_settings_2025_11_10_20_30
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gate settings" ON gate_settings_2025_11_10_20_30
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS политики для OKX
CREATE POLICY "Users can view own okx settings" ON okx_settings_2025_11_10_20_30
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own okx settings" ON okx_settings_2025_11_10_20_30
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own okx settings" ON okx_settings_2025_11_10_20_30
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS политики для KuCoin
CREATE POLICY "Users can view own kucoin settings" ON kucoin_settings_2025_11_10_20_30
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own kucoin settings" ON kucoin_settings_2025_11_10_20_30
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own kucoin settings" ON kucoin_settings_2025_11_10_20_30
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS политики для MEXC
CREATE POLICY "Users can view own mexc settings" ON mexc_settings_2025_11_10_20_30
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mexc settings" ON mexc_settings_2025_11_10_20_30
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mexc settings" ON mexc_settings_2025_11_10_20_30
    FOR UPDATE USING (auth.uid() = user_id);

-- Создаем функции для UPSERT (вставка или обновление)
CREATE OR REPLACE FUNCTION upsert_binance_settings(
    p_user_id UUID,
    p_symbol TEXT DEFAULT 'BTCUSDT',
    p_leverage INTEGER DEFAULT 10,
    p_risk_percent DECIMAL DEFAULT 2.00,
    p_long_tp DECIMAL DEFAULT 2.00,
    p_long_sl DECIMAL DEFAULT 1.00,
    p_short_tp DECIMAL DEFAULT 2.00,
    p_short_sl DECIMAL DEFAULT 1.00,
    p_min_order_size DECIMAL DEFAULT 10.00,
    p_max_positions INTEGER DEFAULT 3,
    p_enabled BOOLEAN DEFAULT true
)
RETURNS UUID AS $$
DECLARE
    result_id UUID;
BEGIN
    INSERT INTO binance_settings_2025_11_10_20_30 (
        user_id, symbol, leverage, risk_percent, long_tp, long_sl, 
        short_tp, short_sl, min_order_size, max_positions, enabled, updated_at
    ) VALUES (
        p_user_id, p_symbol, p_leverage, p_risk_percent, p_long_tp, p_long_sl,
        p_short_tp, p_short_sl, p_min_order_size, p_max_positions, p_enabled, NOW()
    )
    ON CONFLICT (user_id) 
    DO UPDATE SET
        symbol = EXCLUDED.symbol,
        leverage = EXCLUDED.leverage,
        risk_percent = EXCLUDED.risk_percent,
        long_tp = EXCLUDED.long_tp,
        long_sl = EXCLUDED.long_sl,
        short_tp = EXCLUDED.short_tp,
        short_sl = EXCLUDED.short_sl,
        min_order_size = EXCLUDED.min_order_size,
        max_positions = EXCLUDED.max_positions,
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
    RETURNING id INTO result_id;
    
    RETURN result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION upsert_bybit_settings(
    p_user_id UUID,
    p_symbol TEXT DEFAULT 'BTCUSDT',
    p_leverage INTEGER DEFAULT 10,
    p_risk_percent DECIMAL DEFAULT 2.00,
    p_long_tp DECIMAL DEFAULT 2.00,
    p_long_sl DECIMAL DEFAULT 1.00,
    p_short_tp DECIMAL DEFAULT 2.00,
    p_short_sl DECIMAL DEFAULT 1.00,
    p_min_order_size DECIMAL DEFAULT 1.00,
    p_max_positions INTEGER DEFAULT 3,
    p_enabled BOOLEAN DEFAULT true
)
RETURNS UUID AS $$
DECLARE
    result_id UUID;
BEGIN
    INSERT INTO bybit_settings_2025_11_10_20_30 (
        user_id, symbol, leverage, risk_percent, long_tp, long_sl, 
        short_tp, short_sl, min_order_size, max_positions, enabled, updated_at
    ) VALUES (
        p_user_id, p_symbol, p_leverage, p_risk_percent, p_long_tp, p_long_sl,
        p_short_tp, p_short_sl, p_min_order_size, p_max_positions, p_enabled, NOW()
    )
    ON CONFLICT (user_id) 
    DO UPDATE SET
        symbol = EXCLUDED.symbol,
        leverage = EXCLUDED.leverage,
        risk_percent = EXCLUDED.risk_percent,
        long_tp = EXCLUDED.long_tp,
        long_sl = EXCLUDED.long_sl,
        short_tp = EXCLUDED.short_tp,
        short_sl = EXCLUDED.short_sl,
        min_order_size = EXCLUDED.min_order_size,
        max_positions = EXCLUDED.max_positions,
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
    RETURNING id INTO result_id;
    
    RETURN result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;