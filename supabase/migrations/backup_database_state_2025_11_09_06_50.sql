-- БЭКАП СОСТОЯНИЯ БАЗЫ ДАННЫХ 2025-11-09 06:50
-- Сохраняем текущие настройки пользователя

-- Текущие настройки торговли
SELECT 'BACKUP: trading_settings_dev' as backup_type, * 
FROM trading_settings_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';

-- Текущие API ключи
SELECT 'BACKUP: api_keys_dev' as backup_type, user_id, exchange, created_at, updated_at
FROM api_keys_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';

-- Создаем таблицу бэкапа настроек
CREATE TABLE IF NOT EXISTS trading_settings_backup_2025_11_09_06_50 AS
SELECT * FROM trading_settings_dev 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';