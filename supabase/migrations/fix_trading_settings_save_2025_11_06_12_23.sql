-- Проверяем структуру таблицы настроек
\d public.trading_settings_2025_11_06_12_23;

-- Проверяем существующие настройки для cloudkroter@gmail.com
SELECT ts.*, u.email 
FROM public.trading_settings_2025_11_06_12_23 ts
JOIN auth.users u ON ts.user_id = u.id
WHERE u.email = 'cloudkroter@gmail.com';

-- Создаем улучшенную функцию сохранения настроек
CREATE OR REPLACE FUNCTION public.save_trading_settings_fixed(
    p_user_id UUID,
    p_exchange TEXT DEFAULT 'bybit',
    p_symbol TEXT DEFAULT 'BTCUSDT',
    p_order_amount_usd NUMERIC DEFAULT 100,
    p_leverage INTEGER DEFAULT 10,
    p_take_profit_percent NUMERIC DEFAULT 0.5,
    p_stop_loss_percent NUMERIC DEFAULT 1.0,
    p_funding_delay_ms INTEGER DEFAULT 5000,
    p_order_timeout_minutes INTEGER DEFAULT 30,
    p_long_tp_offset_percent NUMERIC DEFAULT 0.3,
    p_long_stop_loss_percent NUMERIC DEFAULT 2.0,
    p_telegram_notifications BOOLEAN DEFAULT true,
    p_auto_trading_enabled BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result_data JSON;
BEGIN
    -- Логируем входные параметры
    RAISE NOTICE 'Saving settings for user: %, exchange: %, symbol: %', p_user_id, p_exchange, p_symbol;
    
    -- Удаляем старые настройки для этого пользователя
    DELETE FROM public.trading_settings_2025_11_06_12_23 
    WHERE user_id = p_user_id;
    
    RAISE NOTICE 'Deleted old settings for user: %', p_user_id;
    
    -- Вставляем новые настройки
    INSERT INTO public.trading_settings_2025_11_06_12_23 (
        user_id, exchange, symbol, order_amount_usd, leverage,
        take_profit_percent, stop_loss_percent, funding_delay_ms,
        order_timeout_minutes, long_tp_offset_percent, long_stop_loss_percent,
        telegram_notifications, auto_trading_enabled, created_at, updated_at
    ) VALUES (
        p_user_id, p_exchange, p_symbol, p_order_amount_usd, p_leverage,
        p_take_profit_percent, p_stop_loss_percent, p_funding_delay_ms,
        p_order_timeout_minutes, p_long_tp_offset_percent, p_long_stop_loss_percent,
        p_telegram_notifications, p_auto_trading_enabled, NOW(), NOW()
    ) RETURNING to_json(trading_settings_2025_11_06_12_23.*) INTO result_data;
    
    RAISE NOTICE 'Inserted new settings: %', result_data;
    
    RETURN result_data;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error saving settings: %', SQLERRM;
END;
$$;

-- Тестируем функцию с тестовыми данными
SELECT public.save_trading_settings_fixed(
    (SELECT id FROM auth.users WHERE email = 'cloudkroter@gmail.com'),
    'bybit',
    'ETHUSDT',
    200,
    15,
    0.8,
    1.5,
    3000,
    45,
    0.4,
    2.5,
    true,
    false
);