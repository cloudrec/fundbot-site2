-- Удаляем старую функцию
DROP FUNCTION IF EXISTS public.save_settings_simple_dev(uuid,text,text,text,numeric,integer,numeric,numeric,integer,integer,numeric,numeric,boolean,boolean);

-- Создаем новую функцию точно как рабочая тестовая
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
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RAISE NOTICE 'DEV: Saving settings for user: %, base_asset: %', p_user_id, p_base_asset;
    
    -- Удаляем старые настройки пользователя
    DELETE FROM public.trading_settings_dev WHERE user_id = p_user_id;
    
    -- Вставляем новые настройки
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
    );
    
    RAISE NOTICE 'DEV: Settings saved successfully for user: %', p_user_id;
    
    RETURN 'SUCCESS: Saved ' || p_base_asset || '/' || p_quote_asset || ' for user ' || p_user_id;
END;
$$;