-- Очистка дубликатов в таблице настроек торговли
-- Удаляем дубликаты, оставляя только самые новые записи
DELETE FROM public.trading_settings_2025_11_06_12_23 a
USING public.trading_settings_2025_11_06_12_23 b
WHERE a.id < b.id 
AND a.user_id = b.user_id 
AND a.exchange = b.exchange;

-- Теперь добавляем уникальный constraint
ALTER TABLE public.trading_settings_2025_11_06_12_23 
ADD CONSTRAINT unique_user_exchange UNIQUE (user_id, exchange);

-- Создаем функцию для автоматического заполнения user_id в настройках
CREATE OR REPLACE FUNCTION public.set_user_id_for_settings()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        NEW.user_id = auth.uid();
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Создаем триггер для автоматического заполнения user_id
DROP TRIGGER IF EXISTS set_user_id_settings_trigger ON public.trading_settings_2025_11_06_12_23;
CREATE TRIGGER set_user_id_settings_trigger
    BEFORE INSERT OR UPDATE ON public.trading_settings_2025_11_06_12_23
    FOR EACH ROW
    EXECUTE FUNCTION public.set_user_id_for_settings();