-- Проверяем текущие секреты (это покажет только названия, не значения)
SELECT name FROM vault.secrets WHERE name LIKE '%PLISIO%';

-- Добавляем PLISIO_API_KEY в секреты Supabase
SELECT vault.create_secret(
    'xxGnwTPLISIO_API_KEY fg971aywnFrgu91MgvuZkigf7z6Q8DBOPewI1i2ENLQ_8ruEF6wXh7Y4IN',
    'PLISIO_API_KEY',
    'API ключ для интеграции с Plisio платежной системой'
);

-- Проверяем что секрет добавлен
SELECT name, description FROM vault.secrets WHERE name = 'PLISIO_API_KEY';