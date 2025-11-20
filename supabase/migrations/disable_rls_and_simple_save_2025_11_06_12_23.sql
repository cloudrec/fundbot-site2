-- Полностью отключаем RLS для всех таблиц для отладки
ALTER TABLE public.trading_settings_2025_11_06_12_23 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys_2025_11_06_12_23 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions_2025_11_06_12_23 DISABLE ROW LEVEL SECURITY;

-- Проверяем существующие настройки для cloudkroter@gmail.com
SELECT ts.*, u.email 
FROM public.trading_settings_2025_11_06_12_23 ts
JOIN auth.users u ON ts.user_id = u.id
WHERE u.email = 'cloudkroter@gmail.com';

-- Удаляем все старые настройки для этого пользователя
DELETE FROM public.trading_settings_2025_11_06_12_23 
WHERE user_id IN (
    SELECT id FROM auth.users WHERE email = 'cloudkroter@gmail.com'
);

-- Создаем простую функцию для сохранения без RLS
CREATE OR REPLACE FUNCTION public.simple_save_settings(
    p_user_id UUID,
    p_exchange TEXT,
    p_symbol TEXT,
    p_order_amount_usd NUMERIC,
    p_leverage INTEGER,
    p_take_profit_percent NUMERIC,
    p_stop_loss_percent NUMERIC,
    p_funding_delay_ms INTEGER,
    p_order_timeout_minutes INTEGER,
    p_long_tp_offset_percent NUMERIC,
    p_long_stop_loss_percent NUMERIC,
    p_telegram_notifications BOOLEAN,
    p_auto_trading_enabled BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result_data JSON;
BEGIN
    -- Удаляем старые настройки
    DELETE FROM public.trading_settings_2025_11_06_12_23 
    WHERE user_id = p_user_id;
    
    -- Вставляем новые
    INSERT INTO public.trading_settings_2025_11_06_12_23 (
        user_id, exchange, symbol, order_amount_usd, leverage,
        take_profit_percent, stop_loss_percent, funding_delay_ms,
        order_timeout_minutes, long_tp_offset_percent, long_stop_loss_percent,
        telegram_notifications, auto_trading_enabled
    ) VALUES (
        p_user_id, p_exchange, p_symbol, p_order_amount_usd, p_leverage,
        p_take_profit_percent, p_stop_loss_percent, p_funding_delay_ms,
        p_order_timeout_minutes, p_long_tp_offset_percent, p_long_stop_loss_percent,
        p_telegram_notifications, p_auto_trading_enabled
    ) RETURNING to_json(trading_settings_2025_11_06_12_23.*) INTO result_data;
    
    RETURN result_data;
END;
$$;