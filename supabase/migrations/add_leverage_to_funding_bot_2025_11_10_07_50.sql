-- Добавление поля leverage в таблицу funding_bot_settings_2025_11_09_06_55
-- Имя: add_leverage_to_funding_bot_2025_11_10_07_50

-- Добавляем поле leverage если его еще нет
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'funding_bot_settings_2025_11_09_06_55' 
        AND column_name = 'leverage'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 
        ADD COLUMN leverage INTEGER DEFAULT 10;
        
        -- Добавляем комментарий к новому полю
        COMMENT ON COLUMN public.funding_bot_settings_2025_11_09_06_55.leverage IS 'Плечо для торговли (1-100x)';
        
        -- Добавляем ограничение на значения плеча
        ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 
        ADD CONSTRAINT funding_bot_leverage_check CHECK (leverage >= 1 AND leverage <= 100);
        
        RAISE NOTICE 'Поле leverage успешно добавлено в таблицу funding_bot_settings_2025_11_09_06_55';
    ELSE
        RAISE NOTICE 'Поле leverage уже существует в таблице funding_bot_settings_2025_11_09_06_55';
    END IF;
    
    -- Обновляем пустые записи значением по умолчанию
    UPDATE public.funding_bot_settings_2025_11_09_06_55 
    SET leverage = 10 
    WHERE leverage IS NULL;
    
    RAISE NOTICE 'Обновлены пустые записи leverage значением по умолчанию (10x)';
END $$;