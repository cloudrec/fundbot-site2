-- Создаем простую функцию сохранения настроек
CREATE OR REPLACE FUNCTION public.save_settings_simple_dev(
    p_user_id UUID,
    p_exchange TEXT,
    p_base_asset TEXT,
    p_quote_asset TEXT,
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
RETURNS TABLE(
    id UUID,
    user_id UUID,
    exchange TEXT,
    base_asset TEXT,
    quote_asset TEXT,
    order_amount_usd NUMERIC,
    leverage INTEGER,
    take_profit_percent NUMERIC,
    stop_loss_percent NUMERIC,
    funding_delay_ms INTEGER,
    order_timeout_minutes INTEGER,
    long_tp_offset_percent NUMERIC,
    long_stop_loss_percent NUMERIC,
    telegram_notifications BOOLEAN,
    auto_trading_enabled BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RAISE NOTICE 'DEV: Saving settings for user: %', p_user_id;
    
    -- Удаляем старые настройки пользователя
    DELETE FROM public.trading_settings_dev WHERE user_id = p_user_id;
    
    -- Вставляем новые настройки
    RETURN QUERY
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
    RETURNING 
        trading_settings_dev.id,
        trading_settings_dev.user_id,
        trading_settings_dev.exchange,
        trading_settings_dev.base_asset,
        trading_settings_dev.quote_asset,
        trading_settings_dev.order_amount_usd,
        trading_settings_dev.leverage,
        trading_settings_dev.take_profit_percent,
        trading_settings_dev.stop_loss_percent,
        trading_settings_dev.funding_delay_ms,
        trading_settings_dev.order_timeout_minutes,
        trading_settings_dev.long_tp_offset_percent,
        trading_settings_dev.long_stop_loss_percent,
        trading_settings_dev.telegram_notifications,
        trading_settings_dev.auto_trading_enabled,
        trading_settings_dev.created_at,
        trading_settings_dev.updated_at;
    
    RAISE NOTICE 'DEV: Settings saved successfully for user: %', p_user_id;
END;
$$;