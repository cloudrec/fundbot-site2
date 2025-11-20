-- Простая тестовая функция
CREATE OR REPLACE FUNCTION public.test_save_dev(
    p_user_id UUID,
    p_base_asset TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RAISE NOTICE 'DEV TEST: Received user_id: %, base_asset: %', p_user_id, p_base_asset;
    
    -- Удаляем старые записи
    DELETE FROM public.trading_settings_dev WHERE user_id = p_user_id;
    
    -- Вставляем новую запись
    INSERT INTO public.trading_settings_dev (
        user_id, exchange, base_asset, quote_asset, order_amount_usd, leverage,
        take_profit_percent, stop_loss_percent, funding_delay_ms,
        order_timeout_minutes, long_tp_offset_percent, long_stop_loss_percent,
        telegram_notifications, auto_trading_enabled, updated_at
    ) VALUES (
        p_user_id, 'bybit', p_base_asset, 'USDT', 100, 10,
        0.5, 1.0, 5000, 30, 0.3, 2.0, true, false, NOW()
    );
    
    RAISE NOTICE 'DEV TEST: Record inserted successfully';
    
    RETURN 'SUCCESS: Saved ' || p_base_asset || ' for user ' || p_user_id;
END;
$$;

-- Проверяем что таблица существует
SELECT COUNT(*) as table_exists FROM information_schema.tables 
WHERE table_name = 'trading_settings_dev' AND table_schema = 'public';