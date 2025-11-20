-- Исправленное добавление поля enabled_exchanges в таблицу trading_settings_dev
-- Имя: add_enabled_exchanges_fixed_2025_11_10_07_06

-- Добавляем поле enabled_exchanges если его еще нет
DO $$ 
DECLARE
    default_exchanges TEXT := '{"binance":true,"bybit":true,"gate":true,"kucoin":true,"okx":true,"mexc":true}';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trading_settings_dev' 
        AND column_name = 'enabled_exchanges'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.trading_settings_dev 
        ADD COLUMN enabled_exchanges TEXT DEFAULT '{"binance":true,"bybit":true,"gate":true,"kucoin":true,"okx":true,"mexc":true}';
        
        -- Добавляем комментарий к новому полю
        COMMENT ON COLUMN public.trading_settings_dev.enabled_exchanges IS 'JSON строка с настройками включенных бирж для торговой панели (независимо от ботов)';
        
        RAISE NOTICE 'Поле enabled_exchanges успешно добавлено в таблицу trading_settings_dev';
    ELSE
        RAISE NOTICE 'Поле enabled_exchanges уже существует в таблице trading_settings_dev';
    END IF;
    
    -- Обновляем пустые записи отдельно
    UPDATE public.trading_settings_dev 
    SET enabled_exchanges = default_exchanges 
    WHERE enabled_exchanges IS NULL OR enabled_exchanges = '';
    
    RAISE NOTICE 'Обновлены пустые записи enabled_exchanges значениями по умолчанию';
END $$;