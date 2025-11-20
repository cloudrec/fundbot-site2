-- Проверяем что секрет PLISIO_API_KEY существует
SELECT name, description, created_at FROM vault.secrets WHERE name = 'PLISIO_API_KEY';

-- Проверяем все секреты
SELECT name FROM vault.secrets ORDER BY name;