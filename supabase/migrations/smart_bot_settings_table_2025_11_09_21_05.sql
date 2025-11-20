-- Создание таблицы для настроек Smart бота
CREATE TABLE IF NOT EXISTS public.smart_bot_settings_2025_11_09_21_05 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT false,
    order_amount_usd DECIMAL(10,2) DEFAULT 10.00,
    leverage INTEGER DEFAULT 10,
    take_profit_percent DECIMAL(5,2) DEFAULT 2.00,
    stop_loss_percent DECIMAL(5,2) DEFAULT 1.00,
    max_position_time_minutes INTEGER DEFAULT 60,
    min_funding_rate DECIMAL(8,5) DEFAULT 0.01000,
    max_positions_per_exchange INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ограничения
    CONSTRAINT smart_bot_settings_user_unique UNIQUE(user_id),
    CONSTRAINT smart_bot_settings_order_amount_check CHECK (order_amount_usd > 0 AND order_amount_usd <= 10000),
    CONSTRAINT smart_bot_settings_leverage_check CHECK (leverage >= 1 AND leverage <= 100),
    CONSTRAINT smart_bot_settings_tp_check CHECK (take_profit_percent > 0 AND take_profit_percent <= 50),
    CONSTRAINT smart_bot_settings_sl_check CHECK (stop_loss_percent > 0 AND stop_loss_percent <= 50),
    CONSTRAINT smart_bot_settings_time_check CHECK (max_position_time_minutes >= 5 AND max_position_time_minutes <= 1440),
    CONSTRAINT smart_bot_settings_funding_check CHECK (min_funding_rate >= 0.001 AND min_funding_rate <= 1),
    CONSTRAINT smart_bot_settings_positions_check CHECK (max_positions_per_exchange >= 1 AND max_positions_per_exchange <= 10)
);

-- Создание индексов
CREATE INDEX IF NOT EXISTS idx_smart_bot_settings_user_id ON public.smart_bot_settings_2025_11_09_21_05(user_id);
CREATE INDEX IF NOT EXISTS idx_smart_bot_settings_enabled ON public.smart_bot_settings_2025_11_09_21_05(enabled);

-- RLS политики
ALTER TABLE public.smart_bot_settings_2025_11_09_21_05 ENABLE ROW LEVEL SECURITY;

-- Политика: пользователи могут видеть только свои настройки
CREATE POLICY "Users can view own smart bot settings" ON public.smart_bot_settings_2025_11_09_21_05
    FOR SELECT USING (auth.uid() = user_id);

-- Политика: пользователи могут создавать свои настройки
CREATE POLICY "Users can insert own smart bot settings" ON public.smart_bot_settings_2025_11_09_21_05
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Политика: пользователи могут обновлять свои настройки
CREATE POLICY "Users can update own smart bot settings" ON public.smart_bot_settings_2025_11_09_21_05
    FOR UPDATE USING (auth.uid() = user_id);

-- Политика: пользователи могут удалять свои настройки
CREATE POLICY "Users can delete own smart bot settings" ON public.smart_bot_settings_2025_11_09_21_05
    FOR DELETE USING (auth.uid() = user_id);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_smart_bot_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER smart_bot_settings_updated_at_trigger
    BEFORE UPDATE ON public.smart_bot_settings_2025_11_09_21_05
    FOR EACH ROW
    EXECUTE FUNCTION update_smart_bot_settings_updated_at();

-- Комментарии к таблице и столбцам
COMMENT ON TABLE public.smart_bot_settings_2025_11_09_21_05 IS 'Настройки Smart бота для автоматической торговли по фандингам';
COMMENT ON COLUMN public.smart_bot_settings_2025_11_09_21_05.enabled IS 'Включен ли Smart бот';
COMMENT ON COLUMN public.smart_bot_settings_2025_11_09_21_05.order_amount_usd IS 'Размер ордера в долларах';
COMMENT ON COLUMN public.smart_bot_settings_2025_11_09_21_05.leverage IS 'Кредитное плечо';
COMMENT ON COLUMN public.smart_bot_settings_2025_11_09_21_05.take_profit_percent IS 'Take Profit в процентах';
COMMENT ON COLUMN public.smart_bot_settings_2025_11_09_21_05.stop_loss_percent IS 'Stop Loss в процентах';
COMMENT ON COLUMN public.smart_bot_settings_2025_11_09_21_05.max_position_time_minutes IS 'Максимальное время удержания позиции в минутах';
COMMENT ON COLUMN public.smart_bot_settings_2025_11_09_21_05.min_funding_rate IS 'Минимальная ставка фандинга для входа в позицию';
COMMENT ON COLUMN public.smart_bot_settings_2025_11_09_21_05.max_positions_per_exchange IS 'Максимальное количество позиций на одной бирже';