-- Удаляем все настройки для этого пользователя
DELETE FROM trading_settings_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';

-- Создаем новую запись с binance
INSERT INTO trading_settings_dev (
    id,
    user_id,
    exchange,
    base_asset,
    quote_asset,
    order_amount_usd,
    leverage,
    take_profit_percent,
    stop_loss_percent,
    funding_delay_ms,
    order_timeout_minutes,
    long_tp_offset_percent,
    long_stop_loss_percent,
    telegram_notifications,
    auto_trading_enabled,
    short_tp,
    short_sl,
    created_at,
    updated_at
) VALUES (
    'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
    'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4',
    'binance',  -- ПРИНУДИТЕЛЬНО BINANCE
    'BTC',
    'USDT',
    100,
    10,
    2.0,
    2.0,
    5000,
    30,
    2.0,
    2.0,
    true,
    false,
    0.9,
    0.9,
    NOW(),
    NOW()
);

-- Проверяем результат
SELECT user_id, exchange, base_asset, quote_asset 
FROM trading_settings_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';