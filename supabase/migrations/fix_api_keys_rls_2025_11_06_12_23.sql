-- Исправление RLS политик для таблицы API ключей
-- Сначала удаляем существующие политики
DROP POLICY IF EXISTS "Users can view own API keys" ON public.api_keys_2025_11_06_12_23;
DROP POLICY IF EXISTS "Users can insert own API keys" ON public.api_keys_2025_11_06_12_23;
DROP POLICY IF EXISTS "Users can update own API keys" ON public.api_keys_2025_11_06_12_23;
DROP POLICY IF EXISTS "Users can delete own API keys" ON public.api_keys_2025_11_06_12_23;

-- Создаем новые исправленные политики
CREATE POLICY "Users can view own API keys" ON public.api_keys_2025_11_06_12_23
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys" ON public.api_keys_2025_11_06_12_23
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys" ON public.api_keys_2025_11_06_12_23
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys" ON public.api_keys_2025_11_06_12_23
    FOR DELETE USING (auth.uid() = user_id);

-- Добавляем функцию для автоматического заполнения user_id
CREATE OR REPLACE FUNCTION public.set_user_id_for_api_keys()
RETURNS TRIGGER AS $$
BEGIN
    NEW.user_id = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Создаем триггер для автоматического заполнения user_id
DROP TRIGGER IF EXISTS set_user_id_trigger ON public.api_keys_2025_11_06_12_23;
CREATE TRIGGER set_user_id_trigger
    BEFORE INSERT ON public.api_keys_2025_11_06_12_23
    FOR EACH ROW
    EXECUTE FUNCTION public.set_user_id_for_api_keys();