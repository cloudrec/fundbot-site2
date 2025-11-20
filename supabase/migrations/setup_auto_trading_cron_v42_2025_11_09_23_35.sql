-- Создаем cron job для автоматического запуска торгового бота каждый час
-- Запуск в начале каждого часа (00:00, 01:00, 02:00, и т.д.)

SELECT cron.schedule(
  'auto-trading-hourly-v42',
  '0 * * * *', -- Каждый час в 00 минут
  $$
  SELECT
    net.http_post(
      url := 'https://zvxhybhst3.supabase.co/functions/v1/auto_trading_hourly_v42_2025_11_09_23_30',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Проверяем созданные cron jobs
SELECT * FROM cron.job WHERE jobname LIKE 'auto-trading%';

-- Создаем таблицу для логирования автоторговли если её нет
CREATE TABLE IF NOT EXISTS trading_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  exchange TEXT NOT NULL,
  order_type TEXT NOT NULL,
  amount DECIMAL(10,2),
  funding_rate DECIMAL(5,4),
  auto_trade BOOLEAN DEFAULT false,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Включаем RLS для trading_log
ALTER TABLE trading_log ENABLE ROW LEVEL SECURITY;

-- Политика для просмотра своих логов
CREATE POLICY "Users can view own trading logs" ON trading_log
  FOR SELECT USING (auth.uid() = user_id);

-- Политика для вставки логов (для системы)
CREATE POLICY "System can insert trading logs" ON trading_log
  FOR INSERT WITH CHECK (true);

-- Комментарии
COMMENT ON TABLE trading_log IS 'Лог автоматической торговли';
COMMENT ON COLUMN trading_log.funding_rate IS 'Ставка фандинга на момент сделки';
COMMENT ON COLUMN trading_log.auto_trade IS 'Была ли сделка автоматической';

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_trading_log_user_id ON trading_log(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_log_created_at ON trading_log(created_at);
CREATE INDEX IF NOT EXISTS idx_trading_log_auto_trade ON trading_log(auto_trade) WHERE auto_trade = true;