-- Добавление поля для стоп лосса лонг ордеров
ALTER TABLE public.trading_settings_2025_11_06_12_23 
ADD COLUMN IF NOT EXISTS long_stop_loss_percent DECIMAL(5,2) NOT NULL DEFAULT 2.0;