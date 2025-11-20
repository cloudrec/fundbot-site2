-- Добавляем колонку is_active в таблицу subscriptions для ручного управления доступом
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Добавляем комментарий к колонке
COMMENT ON COLUMN public.subscriptions.is_active IS 'Ручная активация/деактивация пользователя администратором';

-- Обновляем существующие записи (все активны по умолчанию)
UPDATE public.subscriptions 
SET is_active = true 
WHERE is_active IS NULL;

-- Создаем индекс для быстрого поиска активных пользователей
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_active 
ON public.subscriptions(is_active);

-- Создаем индекс для комбинированного поиска
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active 
ON public.subscriptions(user_id, is_active);