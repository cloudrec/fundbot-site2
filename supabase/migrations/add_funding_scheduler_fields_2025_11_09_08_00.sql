-- Добавляем поля для автоматического планировщика фандингов
ALTER TABLE funding_bot_settings_2025_11_09_06_55 
ADD COLUMN IF NOT EXISTS last_scan_time TIMESTAMPTZ;

ALTER TABLE funding_bot_settings_2025_11_09_06_55 
ADD COLUMN IF NOT EXISTS scan_interval_minutes INTEGER DEFAULT 30 CHECK (scan_interval_minutes >= 15 AND scan_interval_minutes <= 240);

ALTER TABLE funding_bot_settings_2025_11_09_06_55 
ADD COLUMN IF NOT EXISTS work_schedule_enabled BOOLEAN DEFAULT false;

ALTER TABLE funding_bot_settings_2025_11_09_06_55 
ADD COLUMN IF NOT EXISTS work_start_hour INTEGER DEFAULT 0 CHECK (work_start_hour >= 0 AND work_start_hour <= 23);

ALTER TABLE funding_bot_settings_2025_11_09_06_55 
ADD COLUMN IF NOT EXISTS work_end_hour INTEGER DEFAULT 23 CHECK (work_end_hour >= 0 AND work_end_hour <= 23);

-- Обновляем существующие записи с новыми значениями по умолчанию
UPDATE funding_bot_settings_2025_11_09_06_55 
SET 
    scan_interval_minutes = 30,
    work_schedule_enabled = false,
    work_start_hour = 0,
    work_end_hour = 23
WHERE scan_interval_minutes IS NULL;

-- Проверяем результат
SELECT user_id, enabled, scan_interval_minutes, work_schedule_enabled, work_start_hour, work_end_hour, last_scan_time, updated_at
FROM funding_bot_settings_2025_11_09_06_55 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';