-- Обновление базы данных для универсального проекта
UPDATE trading_settings 
SET exchange = 'bybit', 
    updated_at = NOW()
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';

-- Проверяем результат
SELECT 
    user_id,
    exchange,
    base_asset,
    quote_asset,
    order_amount_usd,
    leverage,
    updated_at
FROM trading_settings 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';