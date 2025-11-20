-- Добавление поля exchanges в таблицу funding_bot_settings_2025_11_09_06_55
-- Имя: add_exchanges_to_funding_bot_2025_11_10_06_55

-- Добавляем поле exchanges если его еще нет
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'funding_bot_settings_2025_11_09_06_55' 
        AND column_name = 'exchanges'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 
        ADD COLUMN exchanges JSONB DEFAULT '["binance", "bybit", "gate", "kucoin", "okx", "mexc"]'::jsonb;
        
        -- Добавляем комментарий к новому полю
        COMMENT ON COLUMN public.funding_bot_settings_2025_11_09_06_55.exchanges IS 'JSON массив выбранных бирж для Funding Bot (независимо от торговой панели и smart бота)';
        
        -- Обновляем существующие записи, устанавливая все биржи по умолчанию
        UPDATE public.funding_bot_settings_2025_11_09_06_55 
        SET exchanges = '["binance", "bybit", "gate", "kucoin", "okx", "mexc"]'::jsonb 
        WHERE exchanges IS NULL;
        
        RAISE NOTICE 'Поле exchanges успешно добавлено в таблицу funding_bot_settings_2025_11_09_06_55';
    ELSE
        RAISE NOTICE 'Поле exchanges уже существует в таблице funding_bot_settings_2025_11_09_06_55';
        
        -- Обновляем существующие записи если поле пустое
        UPDATE public.funding_bot_settings_2025_11_09_06_55 
        SET exchanges = '["binance", "bybit", "gate", "kucoin", "okx", "mexc"]'::jsonb 
        WHERE exchanges IS NULL OR exchanges = 'null'::jsonb;
    END IF;
END $$;