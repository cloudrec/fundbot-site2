-- Проверяем существует ли функция
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name LIKE '%trading_settings_dev%' 
AND routine_schema = 'public';

-- Проверяем данные в таблице
SELECT * FROM public.trading_settings_dev LIMIT 5;

-- Тестируем функцию напрямую
SELECT public.save_trading_settings_dev(
    (SELECT id FROM auth.users WHERE email = 'cloudkroter@gmail.com'),
    'bybit',
    'TEST',
    'USDT',
    150,
    15,
    1.0,
    2.0,
    6000,
    45,
    0.5,
    3.0,
    true,
    true
);