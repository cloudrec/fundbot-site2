-- Добавление всех недостающих колонок в trading_settings
ALTER TABLE trading_settings 
ADD COLUMN IF NOT EXISTS funding_delay_ms INTEGER DEFAULT 5000,
ADD COLUMN IF NOT EXISTS funding_threshold_percent DECIMAL(5,2) DEFAULT 0.01,
ADD COLUMN IF NOT EXISTS max_funding_positions INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS risk_management_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS max_daily_loss_percent DECIMAL(5,2) DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS position_size_percent DECIMAL(5,2) DEFAULT 10.0;

-- Проверяем структуру таблицы
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'trading_settings' 
ORDER BY ordinal_position;