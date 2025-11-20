-- Добавляем недостающие колонки в trading_settings
ALTER TABLE trading_settings 
ADD COLUMN IF NOT EXISTS funding_delay_ms INTEGER DEFAULT 5000,
ADD COLUMN IF NOT EXISTS order_timeout_minutes INTEGER DEFAULT 30;