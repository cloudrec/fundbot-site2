-- Исправленное добавление поля exchanges в таблицу funding_bot_settings_2025_11_09_06_55
-- Имя: add_exchanges_to_funding_bot_fixed_2025_11_10_06_56

-- Сначала проверим структуру таблицы
DO $$ 
DECLARE
    col_exists boolean;
    col_type text;
BEGIN
    -- Проверяем существование поля exchanges
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'funding_bot_settings_2025_11_09_06_55' 
        AND column_name = 'exchanges'
        AND table_schema = 'public'
    ) INTO col_exists;
    
    IF NOT col_exists THEN
        -- Добавляем поле exchanges как JSONB
        ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 
        ADD COLUMN exchanges JSONB DEFAULT '["binance", "bybit", "gate", "kucoin", "okx", "mexc"]'::jsonb;
        
        -- Добавляем комментарий к новому полю
        COMMENT ON COLUMN public.funding_bot_settings_2025_11_09_06_55.exchanges IS 'JSON массив выбранных бирж для Funding Bot (независимо от торговой панели и smart бота)';
        
        RAISE NOTICE 'Поле exchanges успешно добавлено в таблицу funding_bot_settings_2025_11_09_06_55';
    ELSE
        -- Проверяем тип существующего поля
        SELECT data_type INTO col_type
        FROM information_schema.columns 
        WHERE table_name = 'funding_bot_settings_2025_11_09_06_55' 
        AND column_name = 'exchanges'
        AND table_schema = 'public';
        
        RAISE NOTICE 'Поле exchanges уже существует в таблице funding_bot_settings_2025_11_09_06_55 с типом: %', col_type;
        
        -- Если поле существует как text[] или другой тип, конвертируем в JSONB
        IF col_type = 'ARRAY' THEN
            -- Конвертируем массив текста в JSONB
            UPDATE public.funding_bot_settings_2025_11_09_06_55 
            SET exchanges = array_to_json(exchanges)::jsonb 
            WHERE exchanges IS NOT NULL;
            
            RAISE NOTICE 'Конвертировано поле exchanges из массива в JSONB';
        END IF;
    END IF;
    
    -- Обновляем пустые записи
    UPDATE public.funding_bot_settings_2025_11_09_06_55 
    SET exchanges = '["binance", "bybit", "gate", "kucoin", "okx", "mexc"]'::jsonb 
    WHERE exchanges IS NULL;
    
    RAISE NOTICE 'Обновлены пустые записи exchanges значениями по умолчанию';
END $$;