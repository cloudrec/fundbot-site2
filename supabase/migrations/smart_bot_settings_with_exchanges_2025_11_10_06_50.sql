-- Создание таблицы настроек Smart Bot с поддержкой чекбоксов бирж
-- Имя: smart_bot_settings_with_exchanges_2025_11_10_06_50

CREATE TABLE IF NOT EXISTS public.smart_bot_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT false,
    order_amount_usd DECIMAL(10,2) DEFAULT 100.00,
    leverage INTEGER DEFAULT 10,
    take_profit_percent DECIMAL(5,2) DEFAULT 2.00,
    stop_loss_percent DECIMAL(5,2) DEFAULT 5.00,
    max_position_time_minutes INTEGER DEFAULT 60,
    min_funding_rate DECIMAL(5,2) DEFAULT 0.50,
    max_positions_per_exchange INTEGER DEFAULT 3,
    exchanges JSONB DEFAULT '["binance", "bybit", "gate", "kucoin", "okx", "mexc"]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Создание индекса для быстрого поиска по пользователю
CREATE INDEX IF NOT EXISTS idx_smart_bot_settings_user_id ON public.smart_bot_settings(user_id);

-- Создание функции для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_smart_bot_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создание триггера для автоматического обновления updated_at
DROP TRIGGER IF EXISTS trigger_update_smart_bot_settings_updated_at ON public.smart_bot_settings;
CREATE TRIGGER trigger_update_smart_bot_settings_updated_at
    BEFORE UPDATE ON public.smart_bot_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_smart_bot_settings_updated_at();

-- Настройка RLS (Row Level Security)
ALTER TABLE public.smart_bot_settings ENABLE ROW LEVEL SECURITY;

-- Политика: пользователи могут видеть только свои настройки
CREATE POLICY "Users can view own smart bot settings" ON public.smart_bot_settings
    FOR SELECT USING (auth.uid() = user_id);

-- Политика: пользователи могут создавать свои настройки
CREATE POLICY "Users can insert own smart bot settings" ON public.smart_bot_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Политика: пользователи могут обновлять свои настройки
CREATE POLICY "Users can update own smart bot settings" ON public.smart_bot_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- Политика: пользователи могут удалять свои настройки
CREATE POLICY "Users can delete own smart bot settings" ON public.smart_bot_settings
    FOR DELETE USING (auth.uid() = user_id);

-- Комментарии для документации
COMMENT ON TABLE public.smart_bot_settings IS 'Настройки Smart Bot для каждого пользователя с независимыми чекбоксами бирж';
COMMENT ON COLUMN public.smart_bot_settings.exchanges IS 'JSON массив выбранных бирж для Smart Bot (независимо от торговой панели)';
COMMENT ON COLUMN public.smart_bot_settings.enabled IS 'Включен ли Smart Bot';
COMMENT ON COLUMN public.smart_bot_settings.order_amount_usd IS 'Размер ордера в USD';
COMMENT ON COLUMN public.smart_bot_settings.leverage IS 'Плечо для торговли';
COMMENT ON COLUMN public.smart_bot_settings.take_profit_percent IS 'Take Profit в процентах';
COMMENT ON COLUMN public.smart_bot_settings.stop_loss_percent IS 'Stop Loss в процентах';
COMMENT ON COLUMN public.smart_bot_settings.max_position_time_minutes IS 'Максимальное время удержания позиции в минутах';
COMMENT ON COLUMN public.smart_bot_settings.min_funding_rate IS 'Минимальная ставка фандинга для входа в позицию';
COMMENT ON COLUMN public.smart_bot_settings.max_positions_per_exchange IS 'Максимальное количество позиций на одной бирже';