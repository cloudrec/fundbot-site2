-- Система управления API лимитами для масштабирования
-- Создано: 2025-11-10 00:30 UTC

-- Таблица для отслеживания лимитов API по биржам
CREATE TABLE IF NOT EXISTS api_rate_limits_2025_11_10_00_30 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exchange TEXT NOT NULL,
    endpoint_type TEXT NOT NULL, -- 'balance', 'order', 'position', 'market_data'
    requests_per_minute INTEGER NOT NULL,
    requests_per_second INTEGER DEFAULT NULL,
    current_requests INTEGER DEFAULT 0,
    last_reset_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_banned BOOLEAN DEFAULT FALSE,
    ban_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(exchange, endpoint_type)
);

-- Очередь запросов к API
CREATE TABLE IF NOT EXISTS api_request_queue_2025_11_10_00_30 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    exchange TEXT NOT NULL,
    action TEXT NOT NULL, -- 'get_balance', 'place_order', 'get_positions'
    priority INTEGER DEFAULT 5, -- 1=highest, 10=lowest
    request_data JSONB NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    result JSONB DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Кэш данных для уменьшения запросов
CREATE TABLE IF NOT EXISTS api_data_cache_2025_11_10_00_30 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    exchange TEXT NOT NULL,
    data_type TEXT NOT NULL, -- 'balance', 'positions', 'market_price'
    cache_key TEXT NOT NULL,
    cached_data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, exchange, cache_key)
);

-- Статистика использования API
CREATE TABLE IF NOT EXISTS api_usage_stats_2025_11_10_00_30 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exchange TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    hour INTEGER DEFAULT EXTRACT(HOUR FROM NOW()),
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    banned_periods INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(exchange, date, hour)
);

-- Вставляем лимиты для каждой биржи
INSERT INTO api_rate_limits_2025_11_10_00_30 (exchange, endpoint_type, requests_per_minute, requests_per_second) VALUES
-- Binance лимиты
('binance', 'balance', 1200, 20),
('binance', 'order', 1200, 20),
('binance', 'position', 1200, 20),
('binance', 'market_data', 2400, 40),

-- Bybit лимиты (более строгие)
('bybit', 'balance', 120, 2),
('bybit', 'order', 120, 2),
('bybit', 'position', 120, 2),
('bybit', 'market_data', 600, 10),

-- Gate.io лимиты
('gate', 'balance', 900, 15),
('gate', 'order', 900, 15),
('gate', 'position', 900, 15),
('gate', 'market_data', 1800, 30),

-- OKX лимиты
('okx', 'balance', 1200, 20),
('okx', 'order', 1200, 20),
('okx', 'position', 1200, 20),
('okx', 'market_data', 2400, 40),

-- KuCoin лимиты
('kucoin', 'balance', 1800, 30),
('kucoin', 'order', 1800, 30),
('kucoin', 'position', 1800, 30),
('kucoin', 'market_data', 3600, 60),

-- MEXC лимиты
('mexc', 'balance', 1200, 20),
('mexc', 'order', 1200, 20),
('mexc', 'position', 1200, 20),
('mexc', 'market_data', 2400, 40)

ON CONFLICT (exchange, endpoint_type) DO UPDATE SET
    requests_per_minute = EXCLUDED.requests_per_minute,
    requests_per_second = EXCLUDED.requests_per_second,
    updated_at = NOW();

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_api_queue_status_priority ON api_request_queue_2025_11_10_00_30(status, priority, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_api_queue_exchange ON api_request_queue_2025_11_10_00_30(exchange, status);
CREATE INDEX IF NOT EXISTS idx_api_cache_lookup ON api_data_cache_2025_11_10_00_30(user_id, exchange, cache_key, expires_at);
CREATE INDEX IF NOT EXISTS idx_api_limits_exchange ON api_rate_limits_2025_11_10_00_30(exchange, endpoint_type);

-- Функция для очистки старых записей
CREATE OR REPLACE FUNCTION cleanup_api_data_2025_11_10_00_30()
RETURNS void AS $$
BEGIN
    -- Удаляем старые записи из очереди (старше 24 часов)
    DELETE FROM api_request_queue_2025_11_10_00_30 
    WHERE created_at < NOW() - INTERVAL '24 hours';
    
    -- Удаляем просроченный кэш
    DELETE FROM api_data_cache_2025_11_10_00_30 
    WHERE expires_at < NOW();
    
    -- Удаляем старую статистику (старше 30 дней)
    DELETE FROM api_usage_stats_2025_11_10_00_30 
    WHERE date < CURRENT_DATE - INTERVAL '30 days';
    
    -- Сбрасываем счетчики лимитов каждую минуту
    UPDATE api_rate_limits_2025_11_10_00_30 
    SET 
        current_requests = 0,
        last_reset_time = NOW()
    WHERE last_reset_time < NOW() - INTERVAL '1 minute';
    
    -- Снимаем баны если время истекло
    UPDATE api_rate_limits_2025_11_10_00_30 
    SET 
        is_banned = FALSE,
        ban_until = NULL
    WHERE is_banned = TRUE AND ban_until < NOW();
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_api_rate_limits_updated_at
    BEFORE UPDATE ON api_rate_limits_2025_11_10_00_30
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_cache_updated_at
    BEFORE UPDATE ON api_data_cache_2025_11_10_00_30
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_stats_updated_at
    BEFORE UPDATE ON api_usage_stats_2025_11_10_00_30
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS политики
ALTER TABLE api_rate_limits_2025_11_10_00_30 ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_request_queue_2025_11_10_00_30 ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_data_cache_2025_11_10_00_30 ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_stats_2025_11_10_00_30 ENABLE ROW LEVEL SECURITY;

-- Политики доступа (только для сервисной роли)
CREATE POLICY "Service role access" ON api_rate_limits_2025_11_10_00_30 FOR ALL USING (true);
CREATE POLICY "Service role access" ON api_request_queue_2025_11_10_00_30 FOR ALL USING (true);
CREATE POLICY "Service role access" ON api_data_cache_2025_11_10_00_30 FOR ALL USING (true);
CREATE POLICY "Service role access" ON api_usage_stats_2025_11_10_00_30 FOR ALL USING (true);

-- Пользователи могут видеть только свои данные в кэше и очереди
CREATE POLICY "Users see own cache" ON api_data_cache_2025_11_10_00_30 
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users see own queue" ON api_request_queue_2025_11_10_00_30 
    FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE api_rate_limits_2025_11_10_00_30 IS 'Управление лимитами API для предотвращения банов';
COMMENT ON TABLE api_request_queue_2025_11_10_00_30 IS 'Очередь запросов к API с приоритизацией';
COMMENT ON TABLE api_data_cache_2025_11_10_00_30 IS 'Кэш данных для уменьшения количества запросов к API';
COMMENT ON TABLE api_usage_stats_2025_11_10_00_30 IS 'Статистика использования API для мониторинга';