-- Проверяем текущие настройки
SELECT user_id, exchange, base_asset, quote_asset, updated_at
FROM trading_settings_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';

-- Если пользователь хочет использовать Bybit, восстанавливаем это
-- (Закомментировано - пользователь должен выбрать сам)
-- UPDATE trading_settings_dev 
-- SET exchange = 'bybit', updated_at = NOW()
-- WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';