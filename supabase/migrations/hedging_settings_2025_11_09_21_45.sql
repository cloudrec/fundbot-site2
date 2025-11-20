-- Добавление настроек хеджирования в Smart бот
ALTER TABLE public.smart_bot_settings ADD COLUMN IF NOT EXISTS hedging_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.smart_bot_settings ADD COLUMN IF NOT EXISTS hedging_exchange VARCHAR(20) DEFAULT 'bybit';
ALTER TABLE public.smart_bot_settings ADD COLUMN IF NOT EXISTS hedging_type VARCHAR(20) DEFAULT 'futures'; -- 'futures' или 'spot'
ALTER TABLE public.smart_bot_settings ADD COLUMN IF NOT EXISTS min_profit_percent DECIMAL(5,2) DEFAULT 0.5;
ALTER TABLE public.smart_bot_settings ADD COLUMN IF NOT EXISTS price_convergence_percent DECIMAL(5,2) DEFAULT 0.1;
ALTER TABLE public.smart_bot_settings ADD COLUMN IF NOT EXISTS max_hedge_time_minutes INTEGER DEFAULT 240;

-- Добавление настроек хеджирования в обычный фандинг бот
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD COLUMN IF NOT EXISTS hedging_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD COLUMN IF NOT EXISTS hedging_exchange VARCHAR(20) DEFAULT 'bybit';
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD COLUMN IF NOT EXISTS hedging_type VARCHAR(20) DEFAULT 'futures';
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD COLUMN IF NOT EXISTS min_profit_percent DECIMAL(5,2) DEFAULT 0.5;
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD COLUMN IF NOT EXISTS price_convergence_percent DECIMAL(5,2) DEFAULT 0.1;
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD COLUMN IF NOT EXISTS max_hedge_time_minutes INTEGER DEFAULT 240;

-- Создание таблицы для отслеживания хеджированных позиций
CREATE TABLE IF NOT EXISTS public.hedge_positions_2025_11_09_21_45 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    bot_type VARCHAR(20) NOT NULL, -- 'smart_bot' или 'funding_bot'
    
    -- Основная позиция
    main_exchange VARCHAR(20) NOT NULL,
    main_symbol VARCHAR(20) NOT NULL,
    main_side VARCHAR(10) NOT NULL, -- 'LONG' или 'SHORT'
    main_order_id VARCHAR(100),
    main_quantity DECIMAL(20,8) NOT NULL,
    main_entry_price DECIMAL(20,8) NOT NULL,
    
    -- Хеджирующая позиция
    hedge_exchange VARCHAR(20) NOT NULL,
    hedge_symbol VARCHAR(20) NOT NULL,
    hedge_side VARCHAR(10) NOT NULL, -- противоположная сторона
    hedge_type VARCHAR(20) NOT NULL, -- 'futures' или 'spot'
    hedge_order_id VARCHAR(100),
    hedge_quantity DECIMAL(20,8) NOT NULL,
    hedge_entry_price DECIMAL(20,8) NOT NULL,
    
    -- Расчеты прибыльности
    expected_funding_rate DECIMAL(8,5) NOT NULL,
    expected_profit_usd DECIMAL(10,2) NOT NULL,
    min_profit_percent DECIMAL(5,2) NOT NULL,
    price_convergence_percent DECIMAL(5,2) NOT NULL,
    
    -- Статус и время
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'waiting_convergence', 'closed', 'error'
    funding_received BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    funding_received_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    max_close_time TIMESTAMP WITH TIME ZONE,
    
    -- Результаты
    actual_profit_usd DECIMAL(10,2),
    close_reason VARCHAR(50), -- 'convergence', 'timeout', 'manual', 'stop_loss'
    
    -- Ограничения
    CONSTRAINT hedge_positions_bot_type_check CHECK (bot_type IN ('smart_bot', 'funding_bot')),
    CONSTRAINT hedge_positions_main_side_check CHECK (main_side IN ('LONG', 'SHORT')),
    CONSTRAINT hedge_positions_hedge_side_check CHECK (hedge_side IN ('LONG', 'SHORT')),
    CONSTRAINT hedge_positions_hedge_type_check CHECK (hedge_type IN ('futures', 'spot')),
    CONSTRAINT hedge_positions_status_check CHECK (status IN ('active', 'waiting_convergence', 'closed', 'error'))
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_hedge_positions_user_id ON public.hedge_positions_2025_11_09_21_45(user_id);
CREATE INDEX IF NOT EXISTS idx_hedge_positions_status ON public.hedge_positions_2025_11_09_21_45(status);
CREATE INDEX IF NOT EXISTS idx_hedge_positions_bot_type ON public.hedge_positions_2025_11_09_21_45(bot_type);
CREATE INDEX IF NOT EXISTS idx_hedge_positions_created_at ON public.hedge_positions_2025_11_09_21_45(created_at);

-- RLS политики
ALTER TABLE public.hedge_positions_2025_11_09_21_45 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own hedge positions" ON public.hedge_positions_2025_11_09_21_45
    FOR ALL USING (auth.uid() = user_id);

-- Функция для автоматического расчета времени закрытия
CREATE OR REPLACE FUNCTION set_hedge_max_close_time()
RETURNS TRIGGER AS $$
BEGIN
    NEW.max_close_time = NEW.created_at + (NEW.max_hedge_time_minutes || ' minutes')::INTERVAL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического расчета времени закрытия
CREATE TRIGGER hedge_positions_set_max_close_time
    BEFORE INSERT ON public.hedge_positions_2025_11_09_21_45
    FOR EACH ROW
    EXECUTE FUNCTION set_hedge_max_close_time();

-- Комментарии
COMMENT ON TABLE public.hedge_positions_2025_11_09_21_45 IS 'Отслеживание хеджированных позиций для фандинг и Smart ботов';
COMMENT ON COLUMN public.hedge_positions_2025_11_09_21_45.expected_funding_rate IS 'Ожидаемая ставка фандинга в процентах';
COMMENT ON COLUMN public.hedge_positions_2025_11_09_21_45.expected_profit_usd IS 'Ожидаемая прибыль в долларах после фандинга';
COMMENT ON COLUMN public.hedge_positions_2025_11_09_21_45.price_convergence_percent IS 'Процент схождения цен для закрытия позиций';
COMMENT ON COLUMN public.hedge_positions_2025_11_09_21_45.hedge_type IS 'Тип хеджирования: фьючерсы или спот';

-- Добавление ограничений для новых полей
ALTER TABLE public.smart_bot_settings ADD CONSTRAINT smart_bot_hedging_exchange_check 
    CHECK (hedging_exchange IN ('binance', 'bybit', 'gate', 'kucoin', 'okx', 'mexc'));
ALTER TABLE public.smart_bot_settings ADD CONSTRAINT smart_bot_hedging_type_check 
    CHECK (hedging_type IN ('futures', 'spot'));
ALTER TABLE public.smart_bot_settings ADD CONSTRAINT smart_bot_min_profit_check 
    CHECK (min_profit_percent >= 0.1 AND min_profit_percent <= 10);
ALTER TABLE public.smart_bot_settings ADD CONSTRAINT smart_bot_convergence_check 
    CHECK (price_convergence_percent >= 0.01 AND price_convergence_percent <= 5);
ALTER TABLE public.smart_bot_settings ADD CONSTRAINT smart_bot_hedge_time_check 
    CHECK (max_hedge_time_minutes >= 30 AND max_hedge_time_minutes <= 1440);

ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD CONSTRAINT funding_bot_hedging_exchange_check 
    CHECK (hedging_exchange IN ('binance', 'bybit', 'gate', 'kucoin', 'okx', 'mexc'));
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD CONSTRAINT funding_bot_hedging_type_check 
    CHECK (hedging_type IN ('futures', 'spot'));
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD CONSTRAINT funding_bot_min_profit_check 
    CHECK (min_profit_percent >= 0.1 AND min_profit_percent <= 10);
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD CONSTRAINT funding_bot_convergence_check 
    CHECK (price_convergence_percent >= 0.01 AND price_convergence_percent <= 5);
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD CONSTRAINT funding_bot_hedge_time_check 
    CHECK (max_hedge_time_minutes >= 30 AND max_hedge_time_minutes <= 1440);