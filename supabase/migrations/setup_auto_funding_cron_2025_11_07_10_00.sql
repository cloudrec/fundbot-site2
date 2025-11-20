-- Создаем cron job для автоматического запуска фандинг-сканера
-- Запускается каждый час на 40-й и 50-й минуте

-- Включаем расширение pg_cron если не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Создаем функцию для вызова Edge Function
CREATE OR REPLACE FUNCTION trigger_auto_funding_scan()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Вызываем Edge Function через HTTP
  PERFORM net.http_post(
    url := 'https://scwnehuyklltcnhgychz.supabase.co/functions/v1/auto_funding_scanner_2025_11_07_10_00',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.supabase_anon_key', true) || '"}'::jsonb,
    body := '{"action": "auto_scan"}'::jsonb
  );
  
  -- Логируем выполнение
  INSERT INTO public.funding_scan_logs_2025_11_07_10_00 (
    scan_time,
    trigger_type,
    status
  ) VALUES (
    NOW(),
    'auto_cron',
    'triggered'
  );
END;
$$;

-- Создаем таблицу для логов сканирования
CREATE TABLE IF NOT EXISTS public.funding_scan_logs_2025_11_07_10_00 (
  id SERIAL PRIMARY KEY,
  scan_time TIMESTAMPTZ DEFAULT NOW(),
  trigger_type TEXT NOT NULL, -- 'auto_cron', 'manual', 'api'
  status TEXT NOT NULL, -- 'triggered', 'completed', 'failed'
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Создаем cron job для запуска на 40-й минуте каждого часа (за 20 минут до конца)
SELECT cron.schedule(
  'funding-scan-20min-before',
  '40 * * * *', -- Каждый час на 40-й минуте
  'SELECT trigger_auto_funding_scan();'
);

-- Создаем cron job для запуска на 50-й минуте каждого часа (за 10 минут до конца)
SELECT cron.schedule(
  'funding-scan-10min-before', 
  '50 * * * *', -- Каждый час на 50-й минуте
  'SELECT trigger_auto_funding_scan();'
);

-- Проверяем созданные cron jobs
SELECT * FROM cron.job WHERE jobname LIKE 'funding-scan%';