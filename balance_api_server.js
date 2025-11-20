import express from 'express';
import cors from 'cors';
import ccxt from 'ccxt';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

// Используем переменные окружения Supabase
const supabaseUrl = 'https://scwnehuyklltcnhgychz.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjd25laHV5a2xsdGNuaGd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMTM1NTg3MSwiZXhwIjoyMDQ2OTMxODcxfQ.qGNcJRr6nCvzM7lxQgPQJflrltYrIBHJNEBnk6lF0-E';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testConnection() {
  try {
    console.log('🔍 Тестируем подключение к Supabase...');
    const { data, error } = await supabase.from('api_keys_2025_11_12_05_30').select('count').limit(1);
    if (error) {
      console.error('❌ Ошибка подключения к Supabase:', error);
      return false;
    }
    console.log('✅ Подключение к Supabase успешно');
    return true;
  } catch (err) {
    console.error('❌ Критическая ошибка:', err);
    return false;
  }
}

async function checkBalance(exchange, apiKey, secret, passphrase, testnet = false) {
  try {
    console.log(`🔍 Проверяем ${exchange} баланс через CCXT...`);
    console.log(`🔑 API Key: ${apiKey.substring(0, 8)}...`);
    
    const config = {
      apiKey: apiKey,
      secret: secret,
      timeout: 30000,
      enableRateLimit: true,
      sandbox: testnet
    };

    if (passphrase && passphrase !== 'пусто' && passphrase !== '') {
      config.password = passphrase;
      console.log(`🔐 Passphrase добавлен`);
    }

    let exchangeClass;
    switch (exchange.toLowerCase()) {
      case 'bybit':
        exchangeClass = new ccxt.bybit(config);
        break;
      case 'binance':
        exchangeClass = new ccxt.binance(config);
        break;
      case 'gate':
        exchangeClass = new ccxt.gate(config);
        break;
      case 'kucoin':
        exchangeClass = new ccxt.kucoin(config);
        break;
      case 'okx':
        exchangeClass = new ccxt.okx(config);
        break;
      case 'mexc':
        exchangeClass = new ccxt.mexc(config);
        break;
      default:
        throw new Error(`Биржа ${exchange} не поддерживается`);
    }

    console.log(`✅ Создан экземпляр ${exchange}, получаем баланс...`);
    const balance = await exchangeClass.fetchBalance();
    
    console.log(`📊 Структура баланса ${exchange}:`, Object.keys(balance));
    
    // Ищем USDT баланс
    let usdtBalance = 0;
    if (balance.USDT && typeof balance.USDT.total === 'number') {
      usdtBalance = balance.USDT.total;
    } else if (balance.total && typeof balance.total.USDT === 'number') {
      usdtBalance = balance.total.USDT;
    } else if (balance.free && typeof balance.free.USDT === 'number') {
      usdtBalance = balance.free.USDT;
    }
    
    console.log(`✅ ${exchange} USDT баланс: ${usdtBalance}`);
    
    return {
      success: true,
      balance: parseFloat(usdtBalance).toFixed(2),
      error: null
    };
  } catch (error) {
    console.error(`❌ ${exchange} ошибка:`, error.message);
    
    let errorMessage = error.message;
    if (error.message.includes('Invalid API')) {
      errorMessage = 'Неверные API ключи';
    } else if (error.message.includes('signature')) {
      errorMessage = 'Ошибка подписи API';
    } else if (error.message.includes('permission')) {
      errorMessage = 'Недостаточно прав API';
    } else if (error.message.includes('IP')) {
      errorMessage = 'IP адрес заблокирован';
    }
    
    return {
      success: false,
      balance: '0.00',
      error: errorMessage
    };
  }
}

app.post('/check-balance', async (req, res) => {
  try {
    const { user_id, exchange } = req.body;
    
    console.log(`🔍 Запрос баланса ${exchange} для user: ${user_id}`);

    const { data: apiKeys, error } = await supabase
      .from('api_keys_2025_11_12_05_30')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', exchange?.toLowerCase());

    console.log(`📊 Результат запроса к БД:`, { 
      found: apiKeys ? apiKeys.length : 0, 
      error: error?.message 
    });

    if (error) {
      console.error('❌ Ошибка БД:', error);
      return res.json({
        success: true,
        connected: false,
        balance: '0.00',
        error: `Ошибка БД: ${error.message}`,
        timestamp: new Date().toISOString(),
        message: `${exchange} ошибка подключения к БД`
      });
    }

    if (!apiKeys || apiKeys.length === 0) {
      console.log(`❌ API ключи для ${exchange} не найдены`);
      return res.json({
        success: true,
        connected: false,
        balance: '0.00',
        error: `API ключи для ${exchange} не найдены`,
        timestamp: new Date().toISOString(),
        message: `${exchange} подключение проверено - ключи НЕ найдены`
      });
    }

    const apiKey = apiKeys[0];
    console.log(`✅ API ключи найдены для ${exchange}: ${apiKey.api_key.substring(0, 8)}...`);

    const balanceResult = await checkBalance(
      exchange,
      apiKey.api_key,
      apiKey.secret,
      apiKey.passphrase,
      apiKey.testnet || false
    );

    if (balanceResult.success) {
      console.log(`✅ РЕАЛЬНЫЙ баланс ${exchange}: ${balanceResult.balance} USDT`);
      res.json({
        success: true,
        connected: true,
        balance: balanceResult.balance,
        error: null,
        timestamp: new Date().toISOString(),
        message: `${exchange} подключение проверено - РЕАЛЬНЫЕ данные получены через CCXT`
      });
    } else {
      console.log(`❌ Ошибка ${exchange}: ${balanceResult.error}`);
      res.json({
        success: true,
        connected: false,
        balance: '0.00',
        error: balanceResult.error,
        timestamp: new Date().toISOString(),
        message: `${exchange} подключение проверено - ошибка API через CCXT`
      });
    }

  } catch (error) {
    console.error('❌ Общая ошибка:', error);
    res.json({
      success: true,
      connected: false,
      balance: '0.00',
      error: error.message,
      timestamp: new Date().toISOString(),
      message: 'Ошибка проверки баланса'
    });
  }
});

const PORT = 3003;

// Тестируем подключение при запуске
testConnection().then(success => {
  if (success) {
    app.listen(PORT, () => {
      console.log(`🚀 Balance API сервер запущен на порту ${PORT}`);
    });
  } else {
    console.error('❌ Не удалось подключиться к Supabase, сервер не запущен');
    process.exit(1);
  }
});
