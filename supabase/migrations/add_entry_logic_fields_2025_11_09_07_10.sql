-- Добавляем новые поля для логики входа в позицию
ALTER TABLE trading_settings_dev 
ADD COLUMN IF NOT EXISTS entry_direction TEXT DEFAULT 'short_first' CHECK (entry_direction IN ('short_first', 'long_first'));

ALTER TABLE trading_settings_dev 
ADD COLUMN IF NOT EXISTS opposite_entry_delay_seconds INTEGER DEFAULT 2 CHECK (opposite_entry_delay_seconds >= 1 AND opposite_entry_delay_seconds <= 300);

-- Удаляем поле auto_trading_enabled так как оно перенесено в отдельную вкладку
ALTER TABLE trading_settings_dev 
DROP COLUMN IF EXISTS auto_trading_enabled;

-- Обновляем существующие записи с новыми значениями по умолчанию
UPDATE trading_settings_dev 
SET 
    entry_direction = 'short_first',
    opposite_entry_delay_seconds = 2
WHERE entry_direction IS NULL OR opposite_entry_delay_seconds IS NULL;

-- Проверяем результат
SELECT user_id, exchange, entry_direction, opposite_entry_delay_seconds, updated_at
FROM trading_settings_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';