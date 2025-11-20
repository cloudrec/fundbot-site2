-- Добавление настройки margin_mode в настройки торговли
ALTER TABLE public.trading_settings_2025_11_09_06_55 ADD COLUMN IF NOT EXISTS margin_mode VARCHAR(20) DEFAULT 'cross';

-- Добавление настройки margin_mode в Smart бот
ALTER TABLE public.smart_bot_settings ADD COLUMN IF NOT EXISTS margin_mode VARCHAR(20) DEFAULT 'cross';

-- Добавление настройки margin_mode в фандинг бот
ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD COLUMN IF NOT EXISTS margin_mode VARCHAR(20) DEFAULT 'cross';

-- Добавление ограничений для margin_mode
ALTER TABLE public.trading_settings_2025_11_09_06_55 ADD CONSTRAINT trading_margin_mode_check 
    CHECK (margin_mode IN ('cross', 'isolated'));

ALTER TABLE public.smart_bot_settings ADD CONSTRAINT smart_bot_margin_mode_check 
    CHECK (margin_mode IN ('cross', 'isolated'));

ALTER TABLE public.funding_bot_settings_2025_11_09_06_55 ADD CONSTRAINT funding_bot_margin_mode_check 
    CHECK (margin_mode IN ('cross', 'isolated'));

-- Комментарии
COMMENT ON COLUMN public.trading_settings_2025_11_09_06_55.margin_mode IS 'Режим маржи: cross (кросс) или isolated (изолированный)';
COMMENT ON COLUMN public.smart_bot_settings.margin_mode IS 'Режим маржи для Smart бота: cross (кросс) или isolated (изолированный)';
COMMENT ON COLUMN public.funding_bot_settings_2025_11_09_06_55.margin_mode IS 'Режим маржи для фандинг бота: cross (кросс) или isolated (изолированный)';