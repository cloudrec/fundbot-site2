-- Создание таблиц для торгового бота
CREATE TABLE IF NOT EXISTS public.trading_settings_2025_11_06_12_23 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange TEXT NOT NULL CHECK (exchange IN ('bybit', 'binance', 'mexc', 'gate', 'kucoin')),
    symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
    order_amount_usd DECIMAL(10,2) NOT NULL DEFAULT 100.00,
    leverage INTEGER NOT NULL DEFAULT 10,
    take_profit_percent DECIMAL(5,2) NOT NULL DEFAULT 0.5,
    stop_loss_percent DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    funding_delay_ms INTEGER NOT NULL DEFAULT 5000,
    order_timeout_minutes INTEGER NOT NULL DEFAULT 30,
    long_tp_offset_percent DECIMAL(5,2) NOT NULL DEFAULT 0.3,
    telegram_notifications BOOLEAN DEFAULT true,
    auto_trading_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trading_orders_2025_11_06_12_23 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    order_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    order_type TEXT NOT NULL CHECK (order_type IN ('limit', 'market')),
    quantity DECIMAL(20,8) NOT NULL,
    price DECIMAL(20,8),
    amount_usd DECIMAL(10,2),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled', 'expired')),
    take_profit_order_id TEXT,
    stop_loss_order_id TEXT,
    funding_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trading_positions_2025_11_06_12_23 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('long', 'short')),
    size DECIMAL(20,8) NOT NULL,
    entry_price DECIMAL(20,8) NOT NULL,
    mark_price DECIMAL(20,8),
    unrealized_pnl DECIMAL(20,8) DEFAULT 0,
    leverage INTEGER NOT NULL,
    margin DECIMAL(20,8),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trading_logs_2025_11_06_12_23 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange TEXT NOT NULL,
    action TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создание индексов для оптимизации
CREATE INDEX IF NOT EXISTS idx_trading_settings_user_id ON public.trading_settings_2025_11_06_12_23(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_orders_user_id ON public.trading_orders_2025_11_06_12_23(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_orders_status ON public.trading_orders_2025_11_06_12_23(status);
CREATE INDEX IF NOT EXISTS idx_trading_positions_user_id ON public.trading_positions_2025_11_06_12_23(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_positions_status ON public.trading_positions_2025_11_06_12_23(status);
CREATE INDEX IF NOT EXISTS idx_trading_logs_user_id ON public.trading_logs_2025_11_06_12_23(user_id);

-- Создание RLS политик
ALTER TABLE public.trading_settings_2025_11_06_12_23 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_orders_2025_11_06_12_23 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_positions_2025_11_06_12_23 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_logs_2025_11_06_12_23 ENABLE ROW LEVEL SECURITY;

-- Политики для trading_settings
CREATE POLICY "Users can view own trading settings" ON public.trading_settings_2025_11_06_12_23
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trading settings" ON public.trading_settings_2025_11_06_12_23
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trading settings" ON public.trading_settings_2025_11_06_12_23
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trading settings" ON public.trading_settings_2025_11_06_12_23
    FOR DELETE USING (auth.uid() = user_id);

-- Политики для trading_orders
CREATE POLICY "Users can view own trading orders" ON public.trading_orders_2025_11_06_12_23
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trading orders" ON public.trading_orders_2025_11_06_12_23
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trading orders" ON public.trading_orders_2025_11_06_12_23
    FOR UPDATE USING (auth.uid() = user_id);

-- Политики для trading_positions
CREATE POLICY "Users can view own trading positions" ON public.trading_positions_2025_11_06_12_23
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trading positions" ON public.trading_positions_2025_11_06_12_23
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trading positions" ON public.trading_positions_2025_11_06_12_23
    FOR UPDATE USING (auth.uid() = user_id);

-- Политики для trading_logs
CREATE POLICY "Users can view own trading logs" ON public.trading_logs_2025_11_06_12_23
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trading logs" ON public.trading_logs_2025_11_06_12_23
    FOR INSERT WITH CHECK (auth.uid() = user_id);