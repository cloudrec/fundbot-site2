-- Создание базы данных для Binance проекта
-- Настройки торговли для Binance
INSERT INTO trading_settings (id, user_id, exchange, base_asset, quote_asset, order_amount_usd, leverage, long_tp_offset_percent, long_stop_loss_percent, short_tp_offset_percent, short_stop_loss_percent, created_at, updated_at) 
VALUES ('b1a2c3d4-e5f6-7890-abcd-ef1234567890', 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4', 'binance', 'SUPER', 'USDT', 10, 11, 1, 1, 0.4, 0.5, NOW(), NOW());

-- Подписка для пользователя
INSERT INTO subscriptions (id, user_email, plan_name, expires_at, is_active, created_at, updated_at) 
VALUES ('b2a3c4d5-e6f7-8901-bcde-f12345678901', 'cloudkroter@gmail.com', 'pro', '2026-11-07T12:00:00+00:00', true, NOW(), NOW());

-- Проверяем результат
SELECT 
    user_id,
    exchange,
    base_asset,
    quote_asset,
    order_amount_usd,
    leverage
FROM trading_settings 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';

SELECT 
    user_email,
    plan_name,
    expires_at,
    is_active
FROM subscriptions 
WHERE user_email = 'cloudkroter@gmail.com';