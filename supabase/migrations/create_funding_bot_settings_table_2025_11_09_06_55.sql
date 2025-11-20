-- Создаем таблицу настроек фандинг бота
CREATE TABLE IF NOT EXISTS funding_bot_settings_2025_11_09_06_55 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Основные настройки
    enabled BOOLEAN DEFAULT false,
    entry_strategy TEXT DEFAULT 'short_first' CHECK (entry_strategy IN ('short_first', 'long_first')),
    min_funding_rate DECIMAL(5,3) DEFAULT 0.5, -- Минимальный фандинг в %
    position_size_usd INTEGER DEFAULT 100, -- Размер позиции в USD
    
    -- Настройки сканирования
    scan_interval_minutes INTEGER DEFAULT 30, -- Интервал сканирования в минутах
    exchanges TEXT[] DEFAULT ARRAY['binance', 'bybit', 'gate'], -- Биржи для сканирования
    
    -- Настройки управления рисками
    max_positions INTEGER DEFAULT 3, -- Максимум открытых позиций
    stop_loss_percent DECIMAL(5,2) DEFAULT 5.0, -- Стоп-лосс в %
    take_profit_percent DECIMAL(5,2) DEFAULT 2.0, -- Тейк-профит в %
    
    -- Настройки уведомлений
    telegram_notifications BOOLEAN DEFAULT true,
    telegram_chat_id TEXT,
    
    -- Расписание работы
    work_schedule_enabled BOOLEAN DEFAULT false,
    work_start_hour INTEGER DEFAULT 0 CHECK (work_start_hour >= 0 AND work_start_hour <= 23),
    work_end_hour INTEGER DEFAULT 23 CHECK (work_end_hour >= 0 AND work_end_hour <= 23),
    
    -- Метаданные
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем индекс для быстрого поиска по пользователю
CREATE INDEX IF NOT EXISTS idx_funding_bot_settings_user_id 
ON funding_bot_settings_2025_11_09_06_55(user_id);

-- Создаем RLS политики
ALTER TABLE funding_bot_settings_2025_11_09_06_55 ENABLE ROW LEVEL SECURITY;

-- Политика: пользователи могут видеть только свои настройки
CREATE POLICY "Users can view own funding bot settings" 
ON funding_bot_settings_2025_11_09_06_55 FOR SELECT 
USING (auth.uid() = user_id);

-- Политика: пользователи могут создавать свои настройки
CREATE POLICY "Users can create own funding bot settings" 
ON funding_bot_settings_2025_11_09_06_55 FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Политика: пользователи могут обновлять свои настройки
CREATE POLICY "Users can update own funding bot settings" 
ON funding_bot_settings_2025_11_09_06_55 FOR UPDATE 
USING (auth.uid() = user_id);

-- Политика: пользователи могут удалять свои настройки
CREATE POLICY "Users can delete own funding bot settings" 
ON funding_bot_settings_2025_11_09_06_55 FOR DELETE 
USING (auth.uid() = user_id);

-- Создаем настройки по умолчанию для текущего пользователя
INSERT INTO funding_bot_settings_2025_11_09_06_55 (
    user_id,
    enabled,
    entry_strategy,
    min_funding_rate,
    position_size_usd,
    scan_interval_minutes,
    exchanges,
    max_positions,
    stop_loss_percent,
    take_profit_percent,
    telegram_notifications
) VALUES (
    'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4',
    false,
    'short_first',
    0.5,
    100,
    30,
    ARRAY['binance', 'bybit', 'gate'],
    3,
    5.0,
    2.0,
    true
) ON CONFLICT DO NOTHING;

-- Проверяем созданную таблицу
SELECT * FROM funding_bot_settings_2025_11_09_06_55 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';