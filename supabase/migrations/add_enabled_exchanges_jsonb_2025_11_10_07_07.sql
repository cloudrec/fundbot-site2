-- Добавление поля enabled_exchanges как JSONB в таблицу trading_settings_dev
-- Имя: add_enabled_exchanges_jsonb_2025_11_10_07_07

-- Добавляем поле enabled_exchanges если его еще нет
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_settings_dev' 
        AND column_name = 'enabled_exchanges'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.trading_settings_dev 
        ADD COLUMN enabled_exchanges JSONB DEFAULT '{"binance":true,"bybit":true,"gate":true,"kucoin":true,"okx":true,"mexc":true}'::jsonb;
        
        -- Добавляем комментарий к новому полю
        COMMENT ON COLUMN public.trading_settings_dev.enabled_exchanges IS 'JSONB объект с настройками включенных бирж для торговой панели (независимо от ботов)';
        
        RAISE NOTICE 'Поле enabled_exchanges успешно добавлено в таблицу trading_settings_dev как JSONB';
    ELSE
        RAISE NOTICE 'Поле enabled_exchanges уже существует в таблице trading_settings_dev';
    END IF;
    
    -- Обновляем пустые записи
    UPDATE public.trading_settings_dev 
    SET enabled_exchanges = '{"binance":true,"bybit":true,"gate":true,"kucoin":true,"okx":true,"mexc":true}'::jsonb 
    WHERE enabled_exchanges IS NULL;
    
    RAISE NOTICE 'Обновлены пустые записи enabled_exchanges значениями по умолчанию';
END $$;