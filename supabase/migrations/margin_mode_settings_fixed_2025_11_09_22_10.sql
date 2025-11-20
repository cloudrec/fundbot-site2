-- Добавление настройки margin_mode в Smart бот
ALTER TABLE public.smart_bot_settings ADD COLUMN IF NOT EXISTS margin_mode VARCHAR(20) DEFAULT 'cross';

-- Добавление настройки margin_mode в фандинг бот
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD COLUMN IF NOT EXISTS margin_mode VARCHAR(20) DEFAULT 'cross';

-- Добавление ограничений для margin_mode
ALTER TABLE public.smart_bot_settings ADD CONSTRAINT smart_bot_margin_mode_check 
    CHECK (margin_mode IN ('cross', 'isolated'));

ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD CONSTRAINT funding_bot_margin_mode_check 
    CHECK (margin_mode IN ('cross', 'isolated'));

-- Комментарии
COMMENT ON COLUMN public.smart_bot_settings.margin_mode IS 'Режим маржи для Smart бота: cross (кросс) или isolated (изолированный)';
COMMENT ON COLUMN public.funding_bot_settings_2025_11_09_06_55.margin_mode IS 'Режим маржи для фандинг бота: cross (кросс) или isolated (изолированный)';

-- Для настроек торговли найдем правильную таблицу и добавим поле
-- Проверим, какая таблица используется для настроек торговли
DO $$
DECLARE
    table_exists boolean;
BEGIN
    -- Проверяем существование различных вариантов таблицы настроек торговли
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'trading_settings'
    ) INTO table_exists;
    
    IF table_exists THEN
        ALTER TABLE public.trading_settings ADD COLUMN IF NOT EXISTS margin_mode VARCHAR(20) DEFAULT 'cross';
        ALTER TABLE public.trading_settings ADD CONSTRAINT trading_margin_mode_check 
            CHECK (margin_mode IN ('cross', 'isolated'));
        RAISE NOTICE 'Added margin_mode to trading_settings table';
    END IF;
    
    -- Проверяем другой вариант названия
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE 'trading_settings_%'
    ) INTO table_exists;
    
    IF table_exists THEN
        -- Получаем точное название таблицы и добавляем поле
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS margin_mode VARCHAR(20) DEFAULT ''cross''',
            (SELECT table_name FROM information_schema.tables 
             WHERE table_schema = 'public' 
             AND table_name LIKE 'trading_settings_%' 
             LIMIT 1));
        RAISE NOTICE 'Added margin_mode to trading settings table with timestamp';
    END IF;
END $$;