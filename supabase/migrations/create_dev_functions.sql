-- Функция для сохранения настроек торговли
CREATE OR REPLACE FUNCTION public.save_trading_settings_dev(
    p_user_id UUID,
    p_exchange TEXT DEFAULT 'bybit',
    p_base_asset TEXT DEFAULT 'BTC',
    p_quote_asset TEXT DEFAULT 'USDT',
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
    user_email TEXT;
BEGIN
    -- Получаем email пользователя для логирования
    SELECT email INTO user_email FROM auth.users WHERE id = p_user_id;
    
    RAISE NOTICE 'DEV: Saving settings for user: % (%), exchange: %, symbol: %', 
        p_user_id, user_email, p_exchange, p_base_asset || p_quote_asset;
    
    -- Используем UPSERT для обновления или вставки
    INSERT INTO public.trading_settings_dev (
        user_id, exchange, base_asset, quote_asset, order_amount_usd, leverage,
        take_profit_percent, stop_loss_percent, funding_delay_ms,
        order_timeout_minutes, long_tp_offset_percent, long_stop_loss_percent,
        telegram_notifications, auto_trading_enabled, updated_at
    ) VALUES (
        p_user_id, p_exchange, p_base_asset, p_quote_asset, p_order_amount_usd, p_leverage,
        p_take_profit_percent, p_stop_loss_percent, p_funding_delay_ms,
        p_order_timeout_minutes, p_long_tp_offset_percent, p_long_stop_loss_percent,
        p_telegram_notifications, p_auto_trading_enabled, NOW()
    ) 
    ON CONFLICT (user_id) 
    DO UPDATE SET
        exchange = EXCLUDED.exchange,
        base_asset = EXCLUDED.base_asset,
        quote_asset = EXCLUDED.quote_asset,
        order_amount_usd = EXCLUDED.order_amount_usd,
        leverage = EXCLUDED.leverage,
        take_profit_percent = EXCLUDED.take_profit_percent,
        stop_loss_percent = EXCLUDED.stop_loss_percent,
        funding_delay_ms = EXCLUDED.funding_delay_ms,
        order_timeout_minutes = EXCLUDED.order_timeout_minutes,
        long_tp_offset_percent = EXCLUDED.long_tp_offset_percent,
        long_stop_loss_percent = EXCLUDED.long_stop_loss_percent,
        telegram_notifications = EXCLUDED.telegram_notifications,
        auto_trading_enabled = EXCLUDED.auto_trading_enabled,
        updated_at = NOW()
    RETURNING to_json(trading_settings_dev.*) INTO result_data;
    
    RAISE NOTICE 'DEV: Settings saved successfully for user: %', user_email;
    
    RETURN result_data;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'DEV: Error saving settings for user %: %', user_email, SQLERRM;
END;
$$;

-- Функция для загрузки настроек
CREATE OR REPLACE FUNCTION public.load_trading_settings_dev(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result_data JSON;
    user_email TEXT;
BEGIN
    SELECT email INTO user_email FROM auth.users WHERE id = p_user_id;
    
    SELECT to_json(trading_settings_dev.*) INTO result_data
    FROM public.trading_settings_dev
    WHERE user_id = p_user_id;
    
    IF result_data IS NULL THEN
        -- Создаем настройки по умолчанию
        SELECT public.save_trading_settings_dev(p_user_id) INTO result_data;
    END IF;
    
    RAISE NOTICE 'DEV: Loaded settings for user: %', user_email;
    
    RETURN result_data;
END;
$$;

-- Функция проверки админа
CREATE OR REPLACE FUNCTION public.is_admin_dev(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admins_dev 
        WHERE user_id = p_user_id
    );
END;
$$;