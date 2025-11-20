-- Проверка и исправление структуры таблицы trading_settings_dev
-- Имя: fix_trading_settings_dev_structure_2025_11_10_07_15

-- Проверяем структуру таблицы
DO $$ 
DECLARE
    col_exists boolean;
    table_exists boolean;
BEGIN
    -- Проверяем существование таблицы
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'trading_settings_dev' 
        AND table_schema = 'public'
    ) INTO table_exists;
    
    IF NOT table_exists THEN
        RAISE NOTICE 'Таблица trading_settings_dev не существует, создаем...';
        
        -- Создаем таблицу с нуля
        CREATE TABLE public.trading_settings_dev (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            exchange TEXT DEFAULT 'bybit',
            base_asset TEXT DEFAULT 'SUPER',
            quote_asset TEXT DEFAULT 'USDT',
            order_amount_usd DECIMAL(10,2) DEFAULT 100.00,
            leverage INTEGER DEFAULT 10,
            long_tp_offset_percent DECIMAL(5,2) DEFAULT 0.30,
            long_stop_loss_percent DECIMAL(5,2) DEFAULT 2.00,
            short_tp_offset_percent DECIMAL(5,2) DEFAULT 0.30,
            short_stop_loss_percent DECIMAL(5,2) DEFAULT 2.00,
            entry_direction TEXT DEFAULT 'short_first',
            opposite_entry_delay_seconds INTEGER DEFAULT 2,
            funding_delay_ms INTEGER DEFAULT 5000,
            order_timeout_minutes INTEGER DEFAULT 30,
            enabled_exchanges JSONB DEFAULT '{"binance":true,"bybit":true,"gate":true,"kucoin":true,"okx":true,"mexc":true}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id)
        );
        
        -- Создаем индекс
        CREATE INDEX idx_trading_settings_dev_user_id ON public.trading_settings_dev(user_id);
        
        -- Настройка RLS
        ALTER TABLE public.trading_settings_dev ENABLE ROW LEVEL SECURITY;
        
        -- Политики RLS
        CREATE POLICY "Users can view own trading settings" ON public.trading_settings_dev
            FOR SELECT USING (auth.uid() = user_id);
        CREATE POLICY "Users can insert own trading settings" ON public.trading_settings_dev
            FOR INSERT WITH CHECK (auth.uid() = user_id);
        CREATE POLICY "Users can update own trading settings" ON public.trading_settings_dev
            FOR UPDATE USING (auth.uid() = user_id);
        CREATE POLICY "Users can delete own trading settings" ON public.trading_settings_dev
            FOR DELETE USING (auth.uid() = user_id);
            
        RAISE NOTICE 'Таблица trading_settings_dev создана успешно';
    ELSE
        RAISE NOTICE 'Таблица trading_settings_dev существует';
        
        -- Проверяем поле enabled_exchanges
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'trading_settings_dev' 
            AND column_name = 'enabled_exchanges'
            AND table_schema = 'public'
        ) INTO col_exists;
        
        IF NOT col_exists THEN
            ALTER TABLE public.trading_settings_dev 
            ADD COLUMN enabled_exchanges JSONB DEFAULT '{"binance":true,"bybit":true,"gate":true,"kucoin":true,"okx":true,"mexc":true}'::jsonb;
            
            COMMENT ON COLUMN public.trading_settings_dev.enabled_exchanges IS 'JSONB объект с настройками включенных бирж для торговой панели';
            
            RAISE NOTICE 'Поле enabled_exchanges добавлено в trading_settings_dev';
        ELSE
            RAISE NOTICE 'Поле enabled_exchanges уже существует в trading_settings_dev';
        END IF;
    END IF;
    
    -- Обновляем пустые записи
    UPDATE public.trading_settings_dev 
    SET enabled_exchanges = '{"binance":true,"bybit":true,"gate":true,"kucoin":true,"okx":true,"mexc":true}'::jsonb 
    WHERE enabled_exchanges IS NULL;
    
    RAISE NOTICE 'Структура таблицы trading_settings_dev проверена и исправлена';
END $$;