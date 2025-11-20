-- Добавляем отсутствующие колонки в таблицу фандинг бота
ALTER TABLE funding_bot_settings_2025_11_09_06_55 
ADD COLUMN IF NOT EXISTS auto_scan_enabled BOOLEAN DEFAULT false;

ALTER TABLE funding_bot_settings_2025_11_09_06_55 
ADD COLUMN IF NOT EXISTS scan_interval_minutes INTEGER DEFAULT 60;

ALTER TABLE funding_bot_settings_2025_11_09_06_55 
ADD COLUMN IF NOT EXISTS work_schedule_enabled BOOLEAN DEFAULT false;

ALTER TABLE funding_bot_settings_2025_11_09_06_55 
ADD COLUMN IF NOT EXISTS work_start_hour INTEGER DEFAULT 0;

ALTER TABLE funding_bot_settings_2025_11_09_06_55 
ADD COLUMN IF NOT EXISTS work_end_hour INTEGER DEFAULT 23;

-- Обновляем существующие записи
UPDATE funding_bot_settings_2025_11_09_06_55 
SET 
  auto_scan_enabled = false,
  scan_interval_minutes = 60,
  work_schedule_enabled = false,
  work_start_hour = 0,
  work_end_hour = 23
WHERE auto_scan_enabled IS NULL;