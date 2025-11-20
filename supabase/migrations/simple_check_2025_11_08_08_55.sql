-- Проверяем все записи в таблице user_api_keys
SELECT COUNT(*) as total_records FROM user_api_keys;

-- Проверяем записи конкретного пользователя
SELECT COUNT(*) as user_records 
FROM user_api_keys 
WHERE user_id = 'a5b7bab7-74c0-47f3-a0df-c5de4b071ce4';

-- Показываем первые 5 записей для анализа
SELECT * FROM user_api_keys LIMIT 5;