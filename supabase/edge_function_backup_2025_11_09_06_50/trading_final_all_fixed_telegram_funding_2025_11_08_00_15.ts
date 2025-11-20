import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface TradingRequest {
  action: 'get_balance' | 'get_positions' | 'place_test_order' | 'place_order_with_tp_sl' | 'cancel_all_orders' | 'cancel_orders' | 'close_all_positions' | 'close_positions' | 'scan_funding';
  user_id: string;
}

// Кеш для цен и защита от дублирования
const priceCache = new Map<string, { price: number, timestamp: number }>();
const orderLocks = new Map<string, number>(); // Защита от дублирования ордеров
const rateLimitCache = new Map<string, number>(); // Защита от rate limiting
const PRICE_CACHE_TTL = 30000; // 30 секунд
const ORDER_LOCK_TTL = 15000; // 15 секунд защита от дублирования
const RATE_LIMIT_DELAY = 10000; // 10 секунд между запросами к Binance

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔥 FINAL FIX Function started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🔥 Request body:', requestBody);
    
    const { action, user_id }: TradingRequest = requestBody;
    
    console.log('🔥 Trading action:', action, 'for user:', user_id);

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // 🚨 ЗАЩИТА ОТ ДУБЛИРОВАНИЯ ОРДЕРОВ
    if (action === 'place_order_with_tp_sl') {
      const now = Date.now();
      const lastOrderTime = orderLocks.get(user_id);
      
      if (lastOrderTime && (now - lastOrderTime) < ORDER_LOCK_TTL) {
        console.log('🚨 DUPLICATE ORDER BLOCKED for user:', user_id, 'last order:', lastOrderTime, 'now:', now);
        throw new Error(`Пожалуйста, подождите ${Math.ceil((ORDER_LOCK_TTL - (now - lastOrderTime)) / 1000)} секунд перед следующим ордером`);
      }
      
      orderLocks.set(user_id, now);
      console.log('🔥 Order lock set for user:', user_id, 'at:', now);
    }

    // Получаем API ключи пользователя
    console.log('🔥 Fetching API keys for user:', user_id);
    const { data: apiKeys, error: apiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true);

    console.log('🔥 API Keys query result:', { apiKeys, apiError });
    
    if (apiError) {
      console.error('❌ API Keys error:', apiError);
      throw new Error(`API Keys database error: ${apiError.message}`);
    }
    
    if (!apiKeys || apiKeys.length === 0) {
      console.error('❌ No API keys found');
      throw new Error('API ключи не найдены или неактивны');
    }

    // Получаем настройки торговли
    console.log('🔥 Fetching trading settings for user:', user_id);
    const { data: settingsData, error: settingsError } = await supabase
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🔥 Settings query result:', { settingsData, settingsError });
    
    if (settingsError) {
      console.error('❌ Settings error:', settingsError);
      throw new Error(`Settings database error: ${settingsError.message}`);
    }
    
    if (!settingsData) {
      console.error('❌ No settings found');
      throw new Error('Настройки торговли не найдены');
    }

    // Находим API ключ для нужной биржи
    const apiKey = apiKeys.find(key => key.exchange === settingsData.exchange);
    if (!apiKey) {
      console.error('❌ No API key for exchange:', settingsData.exchange);
      throw new Error(`API ключ для биржи ${settingsData.exchange} не найден`);
    }

    console.log('🔥 Using exchange:', apiKey.exchange);

    let result;
    switch (action) {
      case 'get_balance':
        console.log('🔥 Executing get_balance');
        result = await getBalance(apiKey, settingsData);
        break;

      case 'get_positions':
        console.log('🔥 Executing get_positions');
        result = await getPositions(apiKey, settingsData);
        break;

      case 'place_test_order':
        console.log('🔥 Executing place_test_order');
        result = await placeTestOrder(apiKey, settingsData);
        break;

      case 'place_order_with_tp_sl':
        console.log('🔥 Executing place_order_with_tp_sl');
        result = await placeOrderWithTPSL(apiKey, settingsData, supabase, user_id);
        break;

      case 'cancel_all_orders':
      case 'cancel_orders':
        console.log('🔥 Executing cancel_orders');
        result = await cancelAllOrders(apiKey, settingsData, supabase, user_id);
        break;

      case 'close_all_positions':
      case 'close_positions':
        console.log('🔥 Executing close_positions');
        result = await closeAllPositions(apiKey, settingsData, supabase, user_id);
        break;

      case 'scan_funding':
        console.log('🔥 Executing scan_funding');
        result = await scanFunding(supabase, user_id, settingsData);
        break;

      default:
        throw new Error(`❌ Неизвестное действие: ${action}`);
    }

    console.log('🔥 Action result:', result);

    return new Response(JSON.stringify({
      success: true,
      data: result,
      exchange: apiKey.exchange.toUpperCase(),
      mode: 'LIVE'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('🔥 Trading error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error',
      errorName: error.name,
      stack: error.stack,
      mode: 'ERROR'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// 📱 ФУНКЦИЯ ОТПРАВКИ TELEGRAM УВЕДОМЛЕНИЙ
async function sendTelegramNotification(supabase: any, user_id: string, message: string, type: 'order' | 'close' | 'cancel' | 'funding' = 'order') {
  try {
    console.log('📱 Sending Telegram notification for user:', user_id, 'type:', type);
    
    // Получаем Telegram настройки пользователя
    const { data: telegramSettings, error: telegramError } = await supabase
      .from('telegram_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .single();

    console.log('📱 Telegram settings query result:', { telegramSettings, telegramError });

    if (telegramError || !telegramSettings) {
      console.log('📱 No Telegram settings found for user:', user_id);
      return { success: false, reason: 'No Telegram settings' };
    }

    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!telegramBotToken) {
      console.error('📱 TELEGRAM_BOT_TOKEN not found in environment');
      return { success: false, reason: 'Bot token not configured' };
    }

    console.log('📱 Using bot token:', telegramBotToken ? 'Found' : 'Not found');
    console.log('📱 Chat ID:', telegramSettings.chat_id);

    const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    
    // Добавляем эмодзи в зависимости от типа
    let emoji = '📊';
    if (type === 'order') emoji = '🚀';
    if (type === 'close') emoji = '🔴';
    if (type === 'cancel') emoji = '❌';
    if (type === 'funding') emoji = '💰';
    
    const fullMessage = `${emoji} ${message}`;
    
    console.log('📱 Sending message:', fullMessage);
    console.log('📱 Telegram URL:', telegramUrl);
    
    const telegramResponse = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: telegramSettings.chat_id,
        text: fullMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: false // Включаем превью для ссылок
      })
    });

    const telegramData = await telegramResponse.json();
    console.log('📱 Telegram response status:', telegramResponse.status);
    console.log('📱 Telegram response data:', telegramData);

    if (telegramResponse.ok) {
      console.log('📱 Telegram notification sent successfully');
      return { success: true, message_id: telegramData.result?.message_id };
    } else {
      console.error('📱 Telegram notification failed:', telegramData);
      return { success: false, reason: telegramData.description };
    }

  } catch (error) {
    console.error('📱 Telegram notification error:', error);
    return { success: false, reason: error.message };
  }
}

// 💰 ФУНКЦИЯ СКАНИРОВАНИЯ ФАНДИНГА
async function scanFunding(supabase: any, user_id: string, settings: any) {
  try {
    console.log('💰 Scanning funding rates for user:', user_id);
    console.log('💰 Settings:', settings);
    
    const symbol = `${settings.base_asset}_${settings.quote_asset}`;
    const exchange = settings.exchange;
    
    console.log('💰 Scanning for symbol:', symbol, 'on exchange:', exchange);
    
    // Получаем текущие ставки фандинга
    let fundingRate = 0;
    let nextFundingTime = '';
    let exchangeUrl = '';
    
    if (exchange === 'binance') {
      // Binance funding rate API
      try {
        console.log('💰 Fetching Binance funding rate...');
        const response = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${settings.base_asset}USDT`);
        const data = await response.json();
        console.log('💰 Binance funding response:', data);
        
        fundingRate = parseFloat(data.lastFundingRate) * 100; // Конвертируем в проценты
        nextFundingTime = new Date(data.nextFundingTime).toLocaleString('ru-RU', { timeZone: 'UTC' });
        exchangeUrl = `https://www.binance.com/en/futures/${settings.base_asset}USDT`;
      } catch (error) {
        console.error('💰 Binance funding error:', error);
      }
    } else if (exchange === 'bybit') {
      // Bybit funding rate API
      try {
        console.log('💰 Fetching Bybit funding rate...');
        const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${settings.base_asset}USDT`);
        const data = await response.json();
        console.log('💰 Bybit funding response:', data);
        
        if (data.result && data.result.list && data.result.list.length > 0) {
          fundingRate = parseFloat(data.result.list[0].fundingRate) * 100;
          nextFundingTime = new Date(parseInt(data.result.list[0].nextFundingTime)).toLocaleString('ru-RU', { timeZone: 'UTC' });
        }
        exchangeUrl = `https://www.bybit.com/trade/usdt/${settings.base_asset}USDT`;
      } catch (error) {
        console.error('💰 Bybit funding error:', error);
      }
    } else if (exchange === 'gate') {
      // Gate.io funding rate API
      try {
        console.log('💰 Fetching Gate.io funding rate...');
        const response = await fetch(`https://api.gateio.ws/api/v4/futures/usdt/contracts/${symbol}`);
        const data = await response.json();
        console.log('💰 Gate.io funding response:', data);
        
        fundingRate = parseFloat(data.funding_rate) * 100;
        nextFundingTime = new Date(data.funding_next_apply * 1000).toLocaleString('ru-RU', { timeZone: 'UTC' });
        exchangeUrl = `https://www.gate.io/futures_trade/USDT/${symbol}`;
      } catch (error) {
        console.error('💰 Gate.io funding error:', error);
      }
    }
    
    console.log('💰 Funding rate found:', fundingRate);
    console.log('💰 Next funding time:', nextFundingTime);
    console.log('💰 Exchange URL:', exchangeUrl);
    
    // Определяем направление фандинга
    const fundingDirection = fundingRate > 0 ? 'LONG платят SHORT' : 'SHORT платят LONG';
    const fundingEmoji = fundingRate > 0 ? '📈' : '📉';
    
    // Отправляем уведомление в Telegram с кликабельной ссылкой
    const telegramMessage = `
<b>💰 ФАНДИНГ НАЙДЕН</b>
<b>Биржа:</b> ${exchange.toUpperCase()}
<b>Символ:</b> ${symbol}
<b>Ставка фандинга:</b> ${fundingEmoji} ${fundingRate.toFixed(4)}%
<b>Направление:</b> ${fundingDirection}
<b>Следующий фандинг:</b> ${nextFundingTime} UTC
<b>Ссылка на торговлю:</b> <a href="${exchangeUrl}">${exchange.toUpperCase()} ${symbol}</a>
<b>Время сканирования:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
    `.trim();

    console.log('💰 Sending Telegram message:', telegramMessage);
    
    const telegramResult = await sendTelegramNotification(supabase, user_id, telegramMessage, 'funding');
    console.log('💰 Telegram send result:', telegramResult);
    
    return {
      exchange: exchange.toUpperCase(),
      symbol: symbol,
      funding_rate: fundingRate,
      funding_direction: fundingDirection,
      next_funding_time: nextFundingTime,
      exchange_url: exchangeUrl,
      scan_time: new Date().toISOString(),
      message: `Фандинг сканирование завершено: ${fundingRate.toFixed(4)}%`,
      telegram_sent: telegramResult.success,
      telegram_error: telegramResult.reason || null
    };
    
  } catch (error: any) {
    console.error('💰 Funding scan error:', error);
    throw new Error(`Ошибка сканирования фандинга: ${error.message}`);
  }
}

// 🟨 BINANCE API FUNCTIONS
async function createBinanceSignature(secret: string, queryString: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(queryString);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 🟡 BYBIT API FUNCTIONS - ИСПРАВЛЕННАЯ ПОДПИСЬ ДЛЯ GET И POST
async function createBybitSignature(secret: string, timestamp: string, apiKey: string, recv_window: string, params: any, method: 'GET' | 'POST' = 'POST'): Promise<string> {
  let param_str = '';
  
  if (method === 'GET') {
    // ДЛЯ GET ЗАПРОСОВ: timestamp + apiKey + recv_window + queryString
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    param_str = timestamp + apiKey + recv_window + queryString;
  } else {
    // ДЛЯ POST ЗАПРОСОВ: timestamp + apiKey + recv_window + JSON.stringify(params)
    param_str = timestamp + apiKey + recv_window + JSON.stringify(params);
  }
  
  console.log('🔥 BYBIT signature inputs:');
  console.log('  Method:', method);
  console.log('  Timestamp:', timestamp);
  console.log('  API Key:', apiKey);
  console.log('  Recv Window:', recv_window);
  console.log('  Params:', params);
  console.log('  Param String:', param_str);
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(param_str);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  console.log('🔥 BYBIT signature result:', result);
  return result;
}

// 🔵 GATE.IO API FUNCTIONS
async function createCompleteGateSignature(secret: string, method: string, url: string, queryString: string = '', payloadString: string = ''): Promise<{ signature: string, timestamp: string }> {
  try {
    // Используем текущее время в секундах (как в официальном примере)
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    console.log('🔥 GATE.IO v4 signature inputs:');
    console.log('  Method:', method);
    console.log('  URL (path only):', url);
    console.log('  Query String:', queryString);
    console.log('  Payload String:', payloadString);
    console.log('  Timestamp:', timestamp);
    
    // Создаем SHA-512 хеш тела запроса (как в официальном примере Python)
    const payloadHash = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(payloadString));
    const hashedPayload = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('🔥 GATE.IO v4 hashed payload:', hashedPayload);
    
    // ОФИЦИАЛЬНЫЙ ФОРМАТ СТРОКИ ПОДПИСИ ПО ДОКУМЕНТАЦИИ:
    // method + '\n' + url + '\n' + query_string + '\n' + hashed_payload + '\n' + timestamp
    const signatureString = `${method}\n${url}\n${queryString}\n${hashedPayload}\n${timestamp}`;
    
    console.log('🔥 GATE.IO v4 signature string:');
    console.log(signatureString);
    
    // Создаем HMAC-SHA512 подпись (как в официальном примере)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(signatureString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('🔥 GATE.IO v4 signature result:', result);
    return { signature: result, timestamp };
  } catch (error) {
    console.error('❌ Error creating GATE.IO v4 signature:', error);
    throw error;
  }
}

// Функции для работы с API
async function getBalance(apiKey: any, settings: any) {
  try {
    console.log('🔥 getBalance started for exchange:', apiKey.exchange);
    
    if (apiKey.exchange === 'binance') {
      console.log('🔥 Processing BINANCE balance request');
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = await createBinanceSignature(apiKey.api_secret, queryString);
      
      const url = `${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`;
      console.log('🔥 BINANCE balance request URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 BINANCE balance response status:', response.status);
      console.log('🔥 BINANCE balance response:', data);

      if (response.status !== 200) {
        throw new Error(`BINANCE API Error: ${data.msg || 'Unknown error'} (Code: ${data.code || response.status})`);
      }

      // Находим USDT баланс
      const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
      
      const result = {
        exchange: 'BINANCE',
        total_balance: usdtBalance?.balance || '0.00',
        available_balance: usdtBalance?.availableBalance || '0.00',
        currency: 'USDT',
        status: apiKey.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
        result: data,
        debug_url: url,
        api_version: 'BINANCE_V2'
      };
      
      console.log('🔥 BINANCE balance result:', result);
      return result;
    }
    
    if (apiKey.exchange === 'bybit') {
      console.log('🔥 Processing BYBIT balance request');
      
      const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recv_window = '5000';
      const params = { accountType: 'UNIFIED', coin: 'USDT' };
      
      const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, recv_window, params, 'GET');
      
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      
      const url = `${baseUrl}/v5/account/wallet-balance?${queryString}`;
      console.log('🔥 BYBIT balance request URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recv_window,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 BYBIT balance response status:', response.status);
      console.log('🔥 BYBIT balance response:', data);

      if (response.status !== 200 || data.retCode !== 0) {
        throw new Error(`BYBIT API Error: ${data.retMsg || 'Unknown error'} (Code: ${data.retCode || response.status})`);
      }

      // Находим USDT баланс
      const account = data.result?.list?.[0];
      const usdtCoin = account?.coin?.find((coin: any) => coin.coin === 'USDT');
      
      const result = {
        exchange: 'BYBIT',
        total_balance: usdtCoin?.walletBalance || '0.00',
        available_balance: usdtCoin?.availableToWithdraw || '0.00',
        currency: 'USDT',
        status: apiKey.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
        result: data,
        debug_url: url,
        api_version: 'BYBIT_V5_FIXED_GET_SIGNATURE'
      };
      
      console.log('🔥 BYBIT balance result:', result);
      return result;
    }
    
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 balance request');
      
      // ОФИЦИАЛЬНЫЕ БАЗОВЫЕ URL ПО ДОКУМЕНТАЦИИ
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      const url = '/futures/usdt/accounts';  // Только путь для подписи (как в официальном примере)
      const queryString = '';
      const payloadString = '';
      
      console.log('🔥 GATE.IO v4: Base URL:', baseUrl);
      console.log('🔥 GATE.IO v4: Prefix:', prefix);
      console.log('🔥 GATE.IO v4: URL path:', url);
      console.log('🔥 GATE.IO v4: Full URL:', baseUrl + prefix + url);
      
      // Создаем подпись по официальному примеру
      const { signature, timestamp } = await createCompleteGateSignature(apiKey.api_secret, 'GET', prefix + url, queryString, payloadString);
      
      const fullUrl = baseUrl + prefix + url;
      console.log('🔥 GATE.IO v4 balance request URL:', fullUrl);
      
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'KEY': apiKey.api_key,
          'SIGN': signature,
          'Timestamp': timestamp,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 GATE.IO v4 balance response status:', response.status);
      console.log('🔥 GATE.IO v4 balance response:', data);

      if (response.status !== 200) {
        throw new Error(`GATE.IO v4 API Error: ${data.message || 'Unknown error'} (Code: ${response.status})`);
      }

      const result = {
        exchange: 'GATE',
        total_balance: data.total || '0.00',
        available_balance: data.available || '0.00',
        currency: 'USDT',
        status: apiKey.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
        result: data,
        debug_url: fullUrl,
        api_version: 'GATE_V4_WITH_AUTO_TP_SL',
        base_url: baseUrl,
        signature_format: 'COMPLETE_DOCUMENTATION_BASED'
      };
      
      console.log('🔥 GATE.IO v4 balance result:', result);
      return result;
    }

    throw new Error(`Получение баланса для ${apiKey.exchange} не поддерживается`);

  } catch (error: any) {
    console.error('🔥 Balance error:', error);
    throw new Error(`Ошибка получения баланса: ${error.message}`);
  }
}

async function placeOrderWithTPSL(apiKey: any, settings: any, supabase: any, user_id: string) {
  try {
    console.log('🔥 placeOrderWithTPSL started for exchange:', apiKey.exchange);
    
    // 🟨 BINANCE IMPLEMENTATION - ИСПРАВЛЕННАЯ ТОЧНОСТЬ
    if (apiKey.exchange === 'binance') {
      console.log('🔥 Processing BINANCE order with TP/SL');
      
      const symbol = `${settings.base_asset}USDT`;
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      
      // Получаем информацию о символе для правильной точности
      const exchangeInfoResponse = await fetch(`${baseUrl}/fapi/v1/exchangeInfo`);
      const exchangeInfo = await exchangeInfoResponse.json();
      const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
      
      if (!symbolInfo) {
        throw new Error(`Символ ${symbol} не найден на Binance`);
      }
      
      // Находим фильтры для LOT_SIZE и PRICE_FILTER
      const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
      const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
      
      console.log('🔥 BINANCE symbol info:', { lotSizeFilter, priceFilter });
      
      // Получаем текущую цену
      const priceResponse = await fetch(`${baseUrl}/fapi/v1/ticker/price?symbol=${symbol}`);
      const priceData = await priceResponse.json();
      
      if (!priceData.price) {
        throw new Error(`Не удалось получить цену для ${symbol} на Binance`);
      }
      
      const currentPrice = parseFloat(priceData.price);
      console.log('🔥 BINANCE current price:', currentPrice);
      
      // Рассчитываем количество с правильной точностью
      const rawQuantity = settings.order_amount_usd / currentPrice;
      const stepSize = parseFloat(lotSizeFilter.stepSize);
      const quantity = (Math.floor(rawQuantity / stepSize) * stepSize).toFixed(8).replace(/\.?0+$/, '');
      
      // Рассчитываем цены TP/SL с правильной точностью
      const tickSize = parseFloat(priceFilter.tickSize);
      const tpPriceRaw = currentPrice * (1 + settings.long_tp_offset_percent / 100);
      const slPriceRaw = currentPrice * (1 - settings.long_stop_loss_percent / 100);
      
      const tpPrice = (Math.round(tpPriceRaw / tickSize) * tickSize).toFixed(8).replace(/\.?0+$/, '');
      const slPrice = (Math.round(slPriceRaw / tickSize) * tickSize).toFixed(8).replace(/\.?0+$/, '');
      
      console.log('🔥 BINANCE order params:', { symbol, quantity, currentPrice, tpPrice, slPrice, stepSize, tickSize });
      
      // 1. Размещаем основной ордер
      const timestamp = Date.now();
      const orderParams = `symbol=${symbol}&side=BUY&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
      const orderSignature = await createBinanceSignature(apiKey.api_secret, orderParams);
      
      const orderResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${orderParams}&signature=${orderSignature}`
      });

      const orderData = await orderResponse.json();
      console.log('🔥 BINANCE main order response:', orderData);

      if (orderResponse.status !== 200) {
        throw new Error(`BINANCE Order Error: ${orderData.msg || 'Unknown error'} (Code: ${orderData.code})`);
      }

      const orderId = orderData.orderId;
      console.log('🔥 BINANCE main order created:', orderId);

      // 2. Размещаем TP ордер
      let tpOrderId = null;
      try {
        const tpTimestamp = Date.now();
        const tpParams = `symbol=${symbol}&side=SELL&type=TAKE_PROFIT_MARKET&quantity=${quantity}&stopPrice=${tpPrice}&timeInForce=GTC&timestamp=${tpTimestamp}`;
        const tpSignature = await createBinanceSignature(apiKey.api_secret, tpParams);
        
        const tpResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey.api_key,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `${tpParams}&signature=${tpSignature}`
        });

        const tpData = await tpResponse.json();
        console.log('🔥 BINANCE TP order response:', tpData);

        if (tpResponse.status === 200) {
          tpOrderId = tpData.orderId;
          console.log('🔥 BINANCE TP order created:', tpOrderId);
        }
      } catch (tpError) {
        console.error('🔥 BINANCE TP order error:', tpError);
      }

      // 3. Размещаем SL ордер
      let slOrderId = null;
      try {
        const slTimestamp = Date.now();
        const slParams = `symbol=${symbol}&side=SELL&type=STOP_MARKET&quantity=${quantity}&stopPrice=${slPrice}&timeInForce=GTC&timestamp=${slTimestamp}`;
        const slSignature = await createBinanceSignature(apiKey.api_secret, slParams);
        
        const slResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey.api_key,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `${slParams}&signature=${slSignature}`
        });

        const slData = await slResponse.json();
        console.log('🔥 BINANCE SL order response:', slData);

        if (slResponse.status === 200) {
          slOrderId = slData.orderId;
          console.log('🔥 BINANCE SL order created:', slOrderId);
        }
      } catch (slError) {
        console.error('🔥 BINANCE SL order error:', slError);
      }

      // 📱 ОТПРАВЛЯЕМ TELEGRAM УВЕДОМЛЕНИЕ
      const telegramMessage = `
<b>🚀 ОРДЕР РАЗМЕЩЕН</b>
<b>Биржа:</b> Binance
<b>Символ:</b> ${symbol}
<b>Сторона:</b> LONG
<b>Количество:</b> ${quantity}
<b>Цена входа:</b> $${currentPrice.toFixed(4)}
<b>Take Profit:</b> $${tpPrice} ${tpOrderId ? '✅' : '❌'}
<b>Stop Loss:</b> $${slPrice} ${slOrderId ? '✅' : '❌'}
<b>ID ордера:</b> ${orderId}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendTelegramNotification(supabase, user_id, telegramMessage, 'order');

      return {
        order_id: orderId,
        tp_order_id: tpOrderId,
        sl_order_id: slOrderId,
        symbol: symbol,
        side: "long",
        status: 'LIVE',
        message: `Боевой ордер BINANCE: ${orderId}`,
        quantity: quantity,
        price: currentPrice,
        tp_price: tpPrice,
        sl_price: slPrice,
        tp_status: tpOrderId ? 'SUCCESS' : 'ERROR',
        sl_status: slOrderId ? 'SUCCESS' : 'ERROR',
        exchange: 'BINANCE',
        api_version: 'BINANCE_V1_FIXED_PRECISION'
      };
    }
    
    // 🟡 BYBIT IMPLEMENTATION - ИСПРАВЛЕННАЯ ПОДПИСЬ И ТОЧНОСТЬ
    if (apiKey.exchange === 'bybit') {
      console.log('🔥 Processing BYBIT order with TP/SL - FIXED SIGNATURE');
      
      const symbol = `${settings.base_asset}USDT`;
      const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      
      // Получаем информацию о символе для правильной точности
      const instrumentResponse = await fetch(`${baseUrl}/v5/market/instruments-info?category=linear&symbol=${symbol}`);
      const instrumentData = await instrumentResponse.json();
      
      if (!instrumentData.result?.list?.[0]) {
        throw new Error(`Символ ${symbol} не найден на Bybit`);
      }
      
      const instrumentInfo = instrumentData.result.list[0];
      const qtyStep = parseFloat(instrumentInfo.lotSizeFilter.qtyStep);
      const tickSize = parseFloat(instrumentInfo.priceFilter.tickSize);
      
      console.log('🔥 BYBIT instrument info:', { qtyStep, tickSize });
      
      // Получаем текущую цену
      const priceResponse = await fetch(`${baseUrl}/v5/market/tickers?category=linear&symbol=${symbol}`);
      const priceData = await priceResponse.json();
      
      if (!priceData.result?.list?.[0]?.lastPrice) {
        throw new Error(`Не удалось получить цену для ${symbol} на Bybit`);
      }
      
      const currentPrice = parseFloat(priceData.result.list[0].lastPrice);
      console.log('🔥 BYBIT current price:', currentPrice);
      
      // Рассчитываем количество с правильной точностью
      const rawQuantity = settings.order_amount_usd / currentPrice;
      const quantity = (Math.floor(rawQuantity / qtyStep) * qtyStep).toFixed(8).replace(/\.?0+$/, '');
      
      // Рассчитываем цены TP/SL с правильной точностью
      const tpPriceRaw = currentPrice * (1 + settings.long_tp_offset_percent / 100);
      const slPriceRaw = currentPrice * (1 - settings.long_stop_loss_percent / 100);
      
      const tpPrice = (Math.round(tpPriceRaw / tickSize) * tickSize).toFixed(8).replace(/\.?0+$/, '');
      const slPrice = (Math.round(slPriceRaw / tickSize) * tickSize).toFixed(8).replace(/\.?0+$/, '');
      
      console.log('🔥 BYBIT order params:', { symbol, quantity, currentPrice, tpPrice, slPrice, qtyStep, tickSize });
      
      // Размещаем ордер с TP/SL
      const timestamp = Date.now().toString();
      const recv_window = '5000';
      
      const orderPayload = {
        category: 'linear',
        symbol: symbol,
        side: 'Buy',
        orderType: 'Market',
        qty: quantity,
        takeProfit: tpPrice,
        stopLoss: slPrice
      };
      
      console.log('🔥 BYBIT order payload:', orderPayload);
      
      const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, recv_window, orderPayload, 'POST');
      
      const orderResponse = await fetch(`${baseUrl}/v5/order/create`, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recv_window,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderPayload)
      });

      const orderData = await orderResponse.json();
      console.log('🔥 BYBIT order response status:', orderResponse.status);
      console.log('🔥 BYBIT order response:', orderData);

      if (orderResponse.status !== 200 || orderData.retCode !== 0) {
        throw new Error(`BYBIT Order Error: ${orderData.retMsg || 'Unknown error'} (Code: ${orderData.retCode})`);
      }

      const orderId = orderData.result.orderId;
      console.log('🔥 BYBIT order created:', orderId);

      // 📱 ОТПРАВЛЯЕМ TELEGRAM УВЕДОМЛЕНИЕ
      const telegramMessage = `
<b>🚀 ОРДЕР РАЗМЕЩЕН</b>
<b>Биржа:</b> Bybit
<b>Символ:</b> ${symbol}
<b>Сторона:</b> LONG
<b>Количество:</b> ${quantity}
<b>Цена входа:</b> $${currentPrice.toFixed(4)}
<b>Take Profit:</b> $${tpPrice} ✅
<b>Stop Loss:</b> $${slPrice} ✅
<b>ID ордера:</b> ${orderId}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendTelegramNotification(supabase, user_id, telegramMessage, 'order');

      return {
        order_id: orderId,
        tp_order_id: 'INTEGRATED',
        sl_order_id: 'INTEGRATED',
        symbol: symbol,
        side: "long",
        status: 'LIVE',
        message: `Боевой ордер BYBIT с TP/SL: ${orderId}`,
        quantity: quantity,
        price: currentPrice,
        tp_price: tpPrice,
        sl_price: slPrice,
        tp_status: 'SUCCESS',
        sl_status: 'SUCCESS',
        exchange: 'BYBIT',
        api_version: 'BYBIT_V5_FIXED_SIGNATURE_AND_PRECISION'
      };
    }
    
    // 🔵 GATE.IO IMPLEMENTATION - ИСПРАВЛЕННЫЕ TP/SL ЧЕРЕЗ PRICE ORDERS API
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 order WITH FIXED TP/SL');
      
      const symbol = `${settings.base_asset}_${settings.quote_asset}`;
      
      // ОФИЦИАЛЬНЫЕ БАЗОВЫЕ URL ПО ДОКУМЕНТАЦИИ
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      
      console.log('🔥 GATE.IO v4 ORDER: Base URL:', baseUrl);
      console.log('🔥 GATE.IO v4 ORDER: Symbol:', symbol);
      
      // Получаем текущую цену
      const priceUrl = `/futures/usdt/tickers?contract=${symbol}`;
      const fullPriceUrl = baseUrl + prefix + priceUrl;
      console.log('🔥 GATE.IO v4 ORDER: Price URL:', fullPriceUrl);
      
      const priceResponse = await fetch(fullPriceUrl);
      const priceData = await priceResponse.json();
      
      console.log('🔥 GATE.IO v4 ORDER: Price response status:', priceResponse.status);
      console.log('🔥 GATE.IO v4 ORDER: Price data:', priceData);
      
      if (!priceData || priceData.length === 0) {
        throw new Error(`Не удалось получить цену для ${symbol} на GATE.IO v4`);
      }
      
      const currentPrice = parseFloat(priceData[0].last);
      console.log('🔥 GATE.IO v4 current price:', currentPrice);
      
      // Рассчитываем количество (Gate.io использует контракты)
      const calculatedQuantity = Math.floor(settings.order_amount_usd / currentPrice);
      const quantity = calculatedQuantity;
      
      // Рассчитываем цены TP/SL с правильным округлением
      const tpPriceNumber = currentPrice * (1 + settings.long_tp_offset_percent / 100);
      const slPriceNumber = currentPrice * (1 - settings.long_stop_loss_percent / 100);
      
      // Функция округления цены для Gate.io (до 4 знаков после запятой)
      const roundGatePrice = (price: number): string => {
        return price.toFixed(4);
      };
      
      const tpPrice = roundGatePrice(tpPriceNumber);
      const slPrice = roundGatePrice(slPriceNumber);
      
      console.log('🔥 GATE.IO v4 order params:', { 
        symbol, 
        quantity, 
        currentPrice,
        tpPrice,
        slPrice
      });
      
      // 1. РАЗМЕЩАЕМ ОСНОВНОЙ ОРДЕР
      const orderData = {
        contract: symbol,
        size: quantity,
        price: "0", // Market order
        tif: "ioc",
        text: `t-${Date.now().toString().slice(-6)}` // Правильный text с t- префиксом
      };
      
      console.log('🔥 GATE.IO v4 MAIN order data:', orderData);
      
      const orderUrl = '/futures/usdt/orders';
      const payloadString = JSON.stringify(orderData);
      const { signature, timestamp } = await createCompleteGateSignature(apiKey.api_secret, 'POST', prefix + orderUrl, '', payloadString);
      
      const fullOrderUrl = baseUrl + prefix + orderUrl;
      console.log('🔥 GATE.IO v4 order request URL:', fullOrderUrl);
      
      const response = await fetch(fullOrderUrl, {
        method: 'POST',
        headers: {
          'KEY': apiKey.api_key,
          'SIGN': signature,
          'Timestamp': timestamp,
          'Content-Type': 'application/json'
        },
        body: payloadString
      });

      const data = await response.json();
      console.log('🔥 GATE.IO v4 order response status:', response.status);
      console.log('🔥 GATE.IO v4 order response:', data);

      if (response.status !== 201) {
        throw new Error(`GATE.IO v4 API Error: ${data.message || 'Unknown error'} (Code: ${response.status})`);
      }

      const orderId = data.id;
      console.log('🔥 GATE.IO v4 MAIN order created:', orderId);

      // 2. РАЗМЕЩАЕМ TP ОРДЕР ЧЕРЕЗ PRICE ORDERS API - ИСПРАВЛЕННАЯ СТРУКТУРА
      let tpOrderId = null;
      let tpStatus = 'ERROR';
      let tpError = null;
      
      try {
        const tpOrderData = {
          trigger: {
            price: tpPrice,
            rule: ">=" // Строка вместо числа
          },
          put: {
            type: "market",
            side: "short",
            contract: symbol,
            size: quantity,
            text: `t-${Date.now().toString().slice(-6)}`
          }
        };
        
        console.log('🔥 GATE.IO v4 TP order data:', tpOrderData);
        
        const tpPayloadString = JSON.stringify(tpOrderData);
        const { signature: tpSig, timestamp: tpTs } = await createCompleteGateSignature(apiKey.api_secret, 'POST', prefix + '/futures/usdt/price_orders', '', tpPayloadString);
        
        const tpResponse = await fetch(baseUrl + prefix + '/futures/usdt/price_orders', {
          method: 'POST',
          headers: {
            'KEY': apiKey.api_key,
            'SIGN': tpSig,
            'Timestamp': tpTs,
            'Content-Type': 'application/json'
          },
          body: tpPayloadString
        });

        const tpData = await tpResponse.json();
        console.log('🔥 GATE.IO v4 TP order response status:', tpResponse.status);
        console.log('🔥 GATE.IO v4 TP order response:', tpData);

        if (tpResponse.status === 201) {
          tpOrderId = tpData.id;
          tpStatus = 'SUCCESS';
          console.log('🔥 GATE.IO v4 TP order created:', tpOrderId);
        } else {
          tpError = tpData.message || 'Unknown TP error';
          console.error('🔥 GATE.IO v4 TP order error:', tpError);
        }
      } catch (tpErr) {
        tpError = tpErr.message;
        console.error('🔥 GATE.IO v4 TP order exception:', tpErr);
      }

      // 3. РАЗМЕЩАЕМ SL ОРДЕР ЧЕРЕЗ PRICE ORDERS API - ИСПРАВЛЕННАЯ СТРУКТУРА
      let slOrderId = null;
      let slStatus = 'ERROR';
      let slError = null;
      
      try {
        const slOrderData = {
          trigger: {
            price: slPrice,
            rule: "<=" // Строка вместо числа
          },
          put: {
            type: "market",
            side: "short",
            contract: symbol,
            size: quantity,
            text: `t-${Date.now().toString().slice(-6)}`
          }
        };
        
        console.log('🔥 GATE.IO v4 SL order data:', slOrderData);
        
        const slPayloadString = JSON.stringify(slOrderData);
        const { signature: slSig, timestamp: slTs } = await createCompleteGateSignature(apiKey.api_secret, 'POST', prefix + '/futures/usdt/price_orders', '', slPayloadString);
        
        const slResponse = await fetch(baseUrl + prefix + '/futures/usdt/price_orders', {
          method: 'POST',
          headers: {
            'KEY': apiKey.api_key,
            'SIGN': slSig,
            'Timestamp': slTs,
            'Content-Type': 'application/json'
          },
          body: slPayloadString
        });

        const slData = await slResponse.json();
        console.log('🔥 GATE.IO v4 SL order response status:', slResponse.status);
        console.log('🔥 GATE.IO v4 SL order response:', slData);

        if (slResponse.status === 201) {
          slOrderId = slData.id;
          slStatus = 'SUCCESS';
          console.log('🔥 GATE.IO v4 SL order created:', slOrderId);
        } else {
          slError = slData.message || 'Unknown SL error';
          console.error('🔥 GATE.IO v4 SL order error:', slError);
        }
      } catch (slErr) {
        slError = slErr.message;
        console.error('🔥 GATE.IO v4 SL order exception:', slErr);
      }

      // 📱 ОТПРАВЛЯЕМ TELEGRAM УВЕДОМЛЕНИЕ
      const telegramMessage = `
<b>🚀 ОРДЕР РАЗМЕЩЕН</b>
<b>Биржа:</b> Gate.io
<b>Символ:</b> ${symbol}
<b>Сторона:</b> LONG
<b>Количество:</b> ${quantity}
<b>Цена входа:</b> $${currentPrice.toFixed(4)}
<b>Take Profit:</b> $${tpPrice} ${tpStatus === 'SUCCESS' ? '✅' : '❌'}
<b>Stop Loss:</b> $${slPrice} ${slStatus === 'SUCCESS' ? '✅' : '❌'}
<b>ID ордера:</b> ${orderId}
<b>TP ID:</b> ${tpOrderId || 'Не установлен'}
<b>SL ID:</b> ${slOrderId || 'Не установлен'}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendTelegramNotification(supabase, user_id, telegramMessage, 'order');

      return {
        order_id: orderId,
        tp_order_id: tpOrderId,
        sl_order_id: slOrderId,
        symbol: symbol,
        side: "long",
        status: 'LIVE',
        message: `Боевой ордер GATE.IO v4 с исправленными TP/SL: ${orderId}`,
        quantity: quantity,
        price: currentPrice,
        tp_price: tpPrice,
        sl_price: slPrice,
        tp_status: tpStatus,
        sl_status: slStatus,
        tp_error: tpError,
        sl_error: slError,
        exchange: 'GATE',
        api_url: 'gateio.ws',
        debug_url: fullOrderUrl,
        api_version: 'GATE_V4_WITH_FIXED_TP_SL_PRICE_ORDERS',
        base_url: baseUrl,
        signature_format: 'COMPLETE_DOCUMENTATION_BASED',
        text_field_fix: 'CORRECT_T_PREFIX_APPLIED',
        tp_sl_implementation: 'FIXED_VIA_PRICE_ORDERS_API',
        price_orders_api: '/futures/usdt/price_orders',
        tp_rule: '>=', // Строка для TP
        sl_rule: '<='  // Строка для SL
      };
    }

    throw new Error(`Размещение ордеров для ${apiKey.exchange} не поддерживается`);

  } catch (error: any) {
    console.error('🔥 Set TP/SL error:', error);
    throw error;
  }
}

async function getPositions(apiKey: any, settings: any) {
  try {
    console.log('🔥 getPositions started for exchange:', apiKey.exchange);
    
    if (apiKey.exchange === 'binance') {
      console.log('🔥 Processing BINANCE positions request');
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = await createBinanceSignature(apiKey.api_secret, queryString);
      
      const url = `${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`;
      console.log('🔥 BINANCE positions request URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 BINANCE positions response status:', response.status);
      console.log('🔥 BINANCE positions response:', data);

      if (response.status !== 200) {
        throw new Error(`BINANCE Positions API Error: ${data.msg || 'Unknown error'} (Code: ${data.code || response.status})`);
      }

      // Фильтруем только открытые позиции
      const openPositions = data.filter((position: any) => parseFloat(position.positionAmt) !== 0);
      
      console.log('🔥 BINANCE open positions:', openPositions);
      return openPositions;
    }
    
    if (apiKey.exchange === 'bybit') {
      console.log('🔥 Processing BYBIT positions request');
      
      const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recv_window = '5000';
      const params = { category: 'linear', symbol: `${settings.base_asset}USDT` };
      
      const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, recv_window, params, 'GET');
      
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      
      const url = `${baseUrl}/v5/position/list?${queryString}`;
      console.log('🔥 BYBIT positions request URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recv_window,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 BYBIT positions response status:', response.status);
      console.log('🔥 BYBIT positions response:', data);

      if (response.status !== 200 || data.retCode !== 0) {
        throw new Error(`BYBIT Positions API Error: ${data.retMsg || 'Unknown error'} (Code: ${data.retCode || response.status})`);
      }

      // Фильтруем только открытые позиции
      const openPositions = data.result?.list?.filter((position: any) => parseFloat(position.size) !== 0) || [];
      
      console.log('🔥 BYBIT open positions:', openPositions);
      return openPositions;
    }
    
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 positions request');
      
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      const url = '/futures/usdt/positions';
      const queryString = '';
      const payloadString = '';
      
      console.log('🔥 GATE.IO v4 positions URL:', baseUrl + prefix + url);
      
      const { signature, timestamp } = await createCompleteGateSignature(apiKey.api_secret, 'GET', prefix + url, queryString, payloadString);
      
      const response = await fetch(baseUrl + prefix + url, {
        method: 'GET',
        headers: {
          'KEY': apiKey.api_key,
          'SIGN': signature,
          'Timestamp': timestamp,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 GATE.IO v4 positions response status:', response.status);
      console.log('🔥 GATE.IO v4 positions response:', data);

      if (response.status !== 200) {
        throw new Error(`GATE.IO v4 Positions API Error: ${data.message || 'Unknown error'} (Code: ${response.status})`);
      }

      // Фильтруем только открытые позиции
      const openPositions = data.filter((position: any) => parseFloat(position.size) !== 0);
      
      console.log('🔥 GATE.IO v4 open positions:', openPositions);
      return openPositions;
    }
    
    throw new Error(`Получение позиций для ${apiKey.exchange} не поддерживается`);

  } catch (error: any) {
    console.error('🔥 Positions error:', error);
    throw new Error(`Ошибка получения позиций: ${error.message}`);
  }
}

async function cancelAllOrders(apiKey: any, settings: any, supabase: any, user_id: string) {
  try {
    console.log('🔥 cancelAllOrders started for exchange:', apiKey.exchange);
    
    if (apiKey.exchange === 'binance') {
      console.log('🔥 Processing BINANCE cancel orders request');
      
      const symbol = `${settings.base_asset}USDT`;
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const timestamp = Date.now();
      const queryString = `symbol=${symbol}&timestamp=${timestamp}`;
      const signature = await createBinanceSignature(apiKey.api_secret, queryString);
      
      const url = `${baseUrl}/fapi/v1/allOpenOrders`;
      console.log('🔥 BINANCE cancel orders URL:', url);
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${queryString}&signature=${signature}`
      });

      const data = await response.json();
      console.log('🔥 BINANCE cancel orders response status:', response.status);
      console.log('🔥 BINANCE cancel orders response:', data);

      if (response.status !== 200) {
        throw new Error(`BINANCE Cancel Orders API Error: ${data.msg || 'Unknown error'} (Code: ${data.code})`);
      }

      // 📱 ОТПРАВЛЯЕМ TELEGRAM УВЕДОМЛЕНИЕ
      const telegramMessage = `
<b>❌ ОРДЕРА ОТМЕНЕНЫ</b>
<b>Биржа:</b> Binance
<b>Символ:</b> ${symbol}
<b>Отменено ордеров:</b> ${data.code === 200 ? 'Все' : 'Неизвестно'}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendTelegramNotification(supabase, user_id, telegramMessage, 'cancel');

      return {
        cancelled_orders: 'ALL',
        exchange: 'BINANCE',
        status: 'LIVE',
        message: `Отмена ордеров BINANCE: ${symbol}`,
        api_version: 'BINANCE_V1',
        symbol: symbol
      };
    }
    
    if (apiKey.exchange === 'bybit') {
      console.log('🔥 Processing BYBIT cancel orders request');
      
      const symbol = `${settings.base_asset}USDT`;
      const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const timestamp = Date.now().toString();
      const recv_window = '5000';
      
      const cancelPayload = {
        category: 'linear',
        symbol: symbol,
        settleCoin: 'USDT'
      };
      
      const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, recv_window, cancelPayload, 'POST');
      
      const url = `${baseUrl}/v5/order/cancel-all`;
      console.log('🔥 BYBIT cancel orders URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recv_window,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cancelPayload)
      });

      const data = await response.json();
      console.log('🔥 BYBIT cancel orders response status:', response.status);
      console.log('🔥 BYBIT cancel orders response:', data);

      if (response.status !== 200 || data.retCode !== 0) {
        throw new Error(`BYBIT Cancel Orders API Error: ${data.retMsg || 'Unknown error'} (Code: ${data.retCode})`);
      }

      // 📱 ОТПРАВЛЯЕМ TELEGRAM УВЕДОМЛЕНИЕ
      const telegramMessage = `
<b>❌ ОРДЕРА ОТМЕНЕНЫ</b>
<b>Биржа:</b> Bybit
<b>Символ:</b> ${symbol}
<b>Отменено ордеров:</b> Все
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendTelegramNotification(supabase, user_id, telegramMessage, 'cancel');

      return {
        cancelled_orders: 'ALL',
        exchange: 'BYBIT',
        status: 'LIVE',
        message: `Отмена ордеров BYBIT: ${symbol}`,
        api_version: 'BYBIT_V5_FIXED_SIGNATURE',
        symbol: symbol
      };
    }
    
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 cancel orders request');
      
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      const symbol = `${settings.base_asset}_${settings.quote_asset}`;
      
      let totalCancelled = 0;
      const cancelResults = [];

      // ОТМЕНА ОБЫЧНЫХ ОРДЕРОВ
      try {
        const ordersUrl = `/futures/usdt/orders?contract=${symbol}&status=open`;
        const { signature: ordersSig, timestamp: ordersTs } = await createCompleteGateSignature(apiKey.api_secret, 'DELETE', prefix + ordersUrl, '', '');
        
        console.log('🔥 GATE.IO v4 cancel regular orders URL:', baseUrl + prefix + ordersUrl);
        
        const ordersResponse = await fetch(baseUrl + prefix + ordersUrl, {
          method: 'DELETE',
          headers: {
            'KEY': apiKey.api_key,
            'SIGN': ordersSig,
            'Timestamp': ordersTs,
            'Content-Type': 'application/json'
          }
        });

        const ordersData = await ordersResponse.json();
        console.log('🔥 GATE.IO v4 cancel regular orders response status:', ordersResponse.status);
        console.log('🔥 GATE.IO v4 cancel regular orders response:', ordersData);

        if (ordersResponse.status === 200 && Array.isArray(ordersData)) {
          totalCancelled += ordersData.length;
          cancelResults.push({
            type: 'REGULAR_ORDERS',
            cancelled: ordersData.length,
            status: 'SUCCESS'
          });
        } else {
          cancelResults.push({
            type: 'REGULAR_ORDERS',
            cancelled: 0,
            status: 'ERROR',
            error: ordersData.message || 'Unknown error'
          });
        }
      } catch (regularError) {
        console.error('🔥 GATE.IO v4 regular orders cancel error:', regularError);
        cancelResults.push({
          type: 'REGULAR_ORDERS',
          cancelled: 0,
          status: 'ERROR',
          error: regularError.message
        });
      }

      // ОТМЕНА PRICE ORDERS (TP/SL)
      try {
        const priceOrdersUrl = `/futures/usdt/price_orders?contract=${symbol}&status=open`;
        const { signature: priceSig, timestamp: priceTs } = await createCompleteGateSignature(apiKey.api_secret, 'DELETE', prefix + priceOrdersUrl, '', '');
        
        console.log('🔥 GATE.IO v4 cancel price orders URL:', baseUrl + prefix + priceOrdersUrl);
        
        const priceResponse = await fetch(baseUrl + prefix + priceOrdersUrl, {
          method: 'DELETE',
          headers: {
            'KEY': apiKey.api_key,
            'SIGN': priceSig,
            'Timestamp': priceTs,
            'Content-Type': 'application/json'
          }
        });

        const priceData = await priceResponse.json();
        console.log('🔥 GATE.IO v4 cancel price orders response status:', priceResponse.status);
        console.log('🔥 GATE.IO v4 cancel price orders response:', priceData);

        if (priceResponse.status === 200 && Array.isArray(priceData)) {
          totalCancelled += priceData.length;
          cancelResults.push({
            type: 'PRICE_ORDERS',
            cancelled: priceData.length,
            status: 'SUCCESS'
          });
        } else {
          cancelResults.push({
            type: 'PRICE_ORDERS',
            cancelled: 0,
            status: 'ERROR',
            error: priceData.message || 'Unknown error'
          });
        }
      } catch (priceError) {
        console.error('🔥 GATE.IO v4 price orders cancel error:', priceError);
        cancelResults.push({
          type: 'PRICE_ORDERS',
          cancelled: 0,
          status: 'ERROR',
          error: priceError.message
        });
      }

      // 📱 ОТПРАВЛЯЕМ TELEGRAM УВЕДОМЛЕНИЕ
      const telegramMessage = `
<b>❌ ОРДЕРА ОТМЕНЕНЫ</b>
<b>Биржа:</b> Gate.io
<b>Символ:</b> ${symbol}
<b>Отменено ордеров:</b> ${totalCancelled}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendTelegramNotification(supabase, user_id, telegramMessage, 'cancel');

      return {
        cancelled_orders: totalCancelled,
        cancel_results: cancelResults,
        exchange: 'GATE',
        status: 'LIVE',
        message: `Отмена ордеров GATE.IO v4: ${totalCancelled} ордеров отменено`,
        api_version: 'GATE_V4_REGULAR_AND_PRICE_ORDERS',
        symbol: symbol,
        cancel_types: 'REGULAR_AND_PRICE_ORDERS'
      };
    }
    
    throw new Error(`Отмена ордеров для ${apiKey.exchange} не поддерживается`);

  } catch (error: any) {
    console.error('🔥 Cancel orders error:', error);
    throw new Error(`Ошибка отмены ордеров: ${error.message}`);
  }
}

async function closeAllPositions(apiKey: any, settings: any, supabase: any, user_id: string) {
  try {
    console.log('🔥 closeAllPositions started for exchange:', apiKey.exchange);
    
    if (apiKey.exchange === 'binance') {
      console.log('🔥 Processing BINANCE close positions request');
      
      const symbol = `${settings.base_asset}USDT`;
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      
      // 1. Получаем открытые позиции
      const timestamp1 = Date.now();
      const posQueryString = `timestamp=${timestamp1}`;
      const posSignature = await createBinanceSignature(apiKey.api_secret, posQueryString);
      
      const posResponse = await fetch(`${baseUrl}/fapi/v2/positionRisk?${posQueryString}&signature=${posSignature}`, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/json'
        }
      });

      const positionsData = await posResponse.json();
      console.log('🔥 BINANCE positions response:', positionsData);

      if (posResponse.status !== 200) {
        throw new Error(`BINANCE Positions API Error: ${positionsData.msg || 'Unknown error'}`);
      }

      // Фильтруем открытые позиции для нашего символа
      const openPositions = positionsData.filter((position: any) => 
        position.symbol === symbol && parseFloat(position.positionAmt) !== 0
      );

      console.log('🔥 BINANCE open positions for', symbol, ':', openPositions);

      if (openPositions.length === 0) {
        return {
          closed_positions: 0,
          exchange: 'BINANCE',
          status: 'LIVE',
          message: `Нет открытых позиций для закрытия по ${symbol}`,
          api_version: 'BINANCE_V2',
          symbol: symbol
        };
      }

      // 2. Закрываем позиции
      let closedPositions = 0;
      const closeResults = [];

      for (const position of openPositions) {
        try {
          const positionAmt = parseFloat(position.positionAmt);
          const side = positionAmt > 0 ? 'SELL' : 'BUY';
          const quantity = Math.abs(positionAmt).toString();
          
          console.log('🔥 BINANCE closing position:', { symbol, side, quantity, positionAmt });

          const timestamp2 = Date.now();
          const closeParams = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp2}`;
          const closeSignature = await createBinanceSignature(apiKey.api_secret, closeParams);
          
          const closeResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
            method: 'POST',
            headers: {
              'X-MBX-APIKEY': apiKey.api_key,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `${closeParams}&signature=${closeSignature}`
          });

          const closeData = await closeResponse.json();
          console.log('🔥 BINANCE close order response:', closeData);

          if (closeResponse.status === 200) {
            closedPositions++;
            closeResults.push({
              symbol: symbol,
              order_id: closeData.orderId,
              status: 'SUCCESS',
              side: side,
              quantity: quantity
            });
            console.log('🔥 BINANCE position closed successfully');
          } else {
            closeResults.push({
              symbol: symbol,
              status: 'ERROR',
              error: closeData.msg || 'Unknown error',
              side: side,
              quantity: quantity
            });
            console.error('🔥 BINANCE close order error:', closeData.msg);
          }

          // Задержка между закрытиями позиций
          await delay(1000);

        } catch (closeError) {
          console.error('🔥 BINANCE close position error:', closeError);
          closeResults.push({
            symbol: symbol,
            status: 'ERROR',
            error: closeError.message
          });
        }
      }

      // 📱 ОТПРАВЛЯЕМ TELEGRAM УВЕДОМЛЕНИЕ
      const telegramMessage = `
<b>🔴 ПОЗИЦИИ ЗАКРЫТЫ</b>
<b>Биржа:</b> Binance
<b>Символ:</b> ${symbol}
<b>Закрыто позиций:</b> ${closedPositions}/${openPositions.length}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendTelegramNotification(supabase, user_id, telegramMessage, 'close');

      return {
        closed_positions: closedPositions,
        total_positions_found: openPositions.length,
        close_results: closeResults,
        exchange: 'BINANCE',
        status: 'LIVE',
        message: `Закрытие позиций BINANCE: ${closedPositions}/${openPositions.length} успешно`,
        api_version: 'BINANCE_V2',
        symbol: symbol
      };
    }
    
    if (apiKey.exchange === 'bybit') {
      console.log('🔥 Processing BYBIT close positions request');
      
      const symbol = `${settings.base_asset}USDT`;
      const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      
      // 1. Получаем открытые позиции
      const timestamp1 = Date.now().toString();
      const recv_window = '5000';
      const posParams = { category: 'linear', symbol: symbol };
      
      const posSignature = await createBybitSignature(apiKey.api_secret, timestamp1, apiKey.api_key, recv_window, posParams, 'GET');
      
      const posQueryString = Object.entries(posParams)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      
      const posResponse = await fetch(`${baseUrl}/v5/position/list?${posQueryString}`, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey.api_key,
          'X-BAPI-SIGN': posSignature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp1,
          'X-BAPI-RECV-WINDOW': recv_window,
          'Content-Type': 'application/json'
        }
      });

      const positionsData = await posResponse.json();
      console.log('🔥 BYBIT positions response:', positionsData);

      if (posResponse.status !== 200 || positionsData.retCode !== 0) {
        throw new Error(`BYBIT Positions API Error: ${positionsData.retMsg || 'Unknown error'}`);
      }

      // Фильтруем открытые позиции
      const openPositions = positionsData.result?.list?.filter((position: any) => 
        parseFloat(position.size) !== 0
      ) || [];

      console.log('🔥 BYBIT open positions for', symbol, ':', openPositions);

      if (openPositions.length === 0) {
        return {
          closed_positions: 0,
          exchange: 'BYBIT',
          status: 'LIVE',
          message: `Нет открытых позиций для закрытия по ${symbol}`,
          api_version: 'BYBIT_V5_FIXED_SIGNATURE',
          symbol: symbol
        };
      }

      // 2. Закрываем позиции
      let closedPositions = 0;
      const closeResults = [];

      for (const position of openPositions) {
        try {
          const positionSize = parseFloat(position.size);
          const side = position.side === 'Buy' ? 'Sell' : 'Buy';
          const quantity = Math.abs(positionSize).toString();
          
          console.log('🔥 BYBIT closing position:', { symbol, side, quantity, positionSize });

          const timestamp2 = Date.now().toString();
          
          const closePayload = {
            category: 'linear',
            symbol: symbol,
            side: side,
            orderType: 'Market',
            qty: quantity,
            reduceOnly: true
          };
          
          const closeSignature = await createBybitSignature(apiKey.api_secret, timestamp2, apiKey.api_key, recv_window, closePayload, 'POST');
          
          const closeResponse = await fetch(`${baseUrl}/v5/order/create`, {
            method: 'POST',
            headers: {
              'X-BAPI-API-KEY': apiKey.api_key,
              'X-BAPI-SIGN': closeSignature,
              'X-BAPI-SIGN-TYPE': '2',
              'X-BAPI-TIMESTAMP': timestamp2,
              'X-BAPI-RECV-WINDOW': recv_window,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(closePayload)
          });

          const closeData = await closeResponse.json();
          console.log('🔥 BYBIT close order response:', closeData);

          if (closeResponse.status === 200 && closeData.retCode === 0) {
            closedPositions++;
            closeResults.push({
              symbol: symbol,
              order_id: closeData.result.orderId,
              status: 'SUCCESS',
              side: side,
              quantity: quantity
            });
            console.log('🔥 BYBIT position closed successfully');
          } else {
            closeResults.push({
              symbol: symbol,
              status: 'ERROR',
              error: closeData.retMsg || 'Unknown error',
              side: side,
              quantity: quantity
            });
            console.error('🔥 BYBIT close order error:', closeData.retMsg);
          }

          // Задержка между закрытиями позиций
          await delay(1000);

        } catch (closeError) {
          console.error('🔥 BYBIT close position error:', closeError);
          closeResults.push({
            symbol: symbol,
            status: 'ERROR',
            error: closeError.message
          });
        }
      }

      // 📱 ОТПРАВЛЯЕМ TELEGRAM УВЕДОМЛЕНИЕ
      const telegramMessage = `
<b>🔴 ПОЗИЦИИ ЗАКРЫТЫ</b>
<b>Биржа:</b> Bybit
<b>Символ:</b> ${symbol}
<b>Закрыто позиций:</b> ${closedPositions}/${openPositions.length}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendTelegramNotification(supabase, user_id, telegramMessage, 'close');

      return {
        closed_positions: closedPositions,
        total_positions_found: openPositions.length,
        close_results: closeResults,
        exchange: 'BYBIT',
        status: 'LIVE',
        message: `Закрытие позиций BYBIT: ${closedPositions}/${openPositions.length} успешно`,
        api_version: 'BYBIT_V5_FIXED_SIGNATURE',
        symbol: symbol
      };
    }
    
    // 🔵 GATE.IO ЗАКРЫТИЕ ПОЗИЦИЙ
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 close positions request');
      
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      const symbol = `${settings.base_asset}_${settings.quote_asset}`;
      
      // 1. Получаем открытые позиции
      const positionsUrl = '/futures/usdt/positions';
      const { signature: posSig, timestamp: posTs } = await createCompleteGateSignature(apiKey.api_secret, 'GET', prefix + positionsUrl, '', '');
      
      console.log('🔥 GATE.IO v4 get positions URL:', baseUrl + prefix + positionsUrl);
      
      const positionsResponse = await fetch(baseUrl + prefix + positionsUrl, {
        method: 'GET',
        headers: {
          'KEY': apiKey.api_key,
          'SIGN': posSig,
          'Timestamp': posTs,
          'Content-Type': 'application/json'
        }
      });

      const positionsData = await positionsResponse.json();
      console.log('🔥 GATE.IO v4 positions response status:', positionsResponse.status);
      console.log('🔥 GATE.IO v4 positions response:', positionsData);

      if (positionsResponse.status !== 200) {
        throw new Error(`GATE.IO v4 Positions API Error: ${positionsData.message || 'Unknown error'} (Code: ${positionsResponse.status})`);
      }

      // Фильтруем открытые позиции для нашего символа
      const openPositions = positionsData.filter((position: any) => 
        position.contract === symbol && parseFloat(position.size) !== 0
      );

      console.log('🔥 GATE.IO v4 open positions for', symbol, ':', openPositions);

      if (openPositions.length === 0) {
        return {
          closed_positions: 0,
          exchange: 'GATE',
          status: 'LIVE',
          message: `Нет открытых позиций для закрытия по ${symbol}`,
          api_version: 'GATE_V4',
          symbol: symbol
        };
      }

      // 2. ЗАКРЫТИЕ ПОЗИЦИЙ ЧЕРЕЗ MARKET ОРДЕРА
      let closedPositions = 0;
      const closeResults = [];

      for (const position of openPositions) {
        try {
          const positionSize = parseFloat(position.size);
          
          console.log('🔥 GATE.IO v4 closing position:', { 
            contract: position.contract, 
            originalSize: positionSize,
            positionType: positionSize > 0 ? 'LONG' : 'SHORT'
          });

          // MARKET ОРДЕР ДЛЯ ЗАКРЫТИЯ
          const closeOrderData = {
            contract: position.contract,
            size: -positionSize, // Противоположный размер для закрытия
            price: "0", // Market order
            tif: "ioc",
            text: `t-${Date.now().toString().slice(-6)}`, // Правильный text с t- префиксом
            reduce_only: true // Важно: только для закрытия позиции
          };

          console.log('🔥 GATE.IO v4 close order data:', closeOrderData);

          const closePayload = JSON.stringify(closeOrderData);
          const { signature: closeSig, timestamp: closeTs } = await createCompleteGateSignature(apiKey.api_secret, 'POST', prefix + '/futures/usdt/orders', '', closePayload);

          const closeResponse = await fetch(baseUrl + prefix + '/futures/usdt/orders', {
            method: 'POST',
            headers: {
              'KEY': apiKey.api_key,
              'SIGN': closeSig,
              'Timestamp': closeTs,
              'Content-Type': 'application/json'
            },
            body: closePayload
          });

          const closeData = await closeResponse.json();
          console.log('🔥 GATE.IO v4 close order response status:', closeResponse.status);
          console.log('🔥 GATE.IO v4 close order response:', closeData);

          if (closeResponse.status === 201) {
            closedPositions++;
            closeResults.push({
              contract: position.contract,
              order_id: closeData.id,
              status: 'SUCCESS',
              original_size: positionSize,
              close_size: -positionSize,
              position_type: positionSize > 0 ? 'LONG' : 'SHORT',
              close_method: 'MARKET_ORDER_WITH_REDUCE_ONLY'
            });
            console.log('🔥 GATE.IO v4 position closed successfully');
          } else {
            closeResults.push({
              contract: position.contract,
              status: 'ERROR',
              error: closeData.message || 'Unknown error',
              original_size: positionSize,
              close_method: 'MARKET_ORDER_WITH_REDUCE_ONLY'
            });
            console.error('🔥 GATE.IO v4 close order error:', closeData.message);
          }

          // Задержка между закрытиями позиций
          await delay(1000);

        } catch (closeError) {
          console.error('🔥 GATE.IO v4 close position error:', closeError);
          closeResults.push({
            contract: position.contract,
            status: 'ERROR',
            error: closeError.message
          });
        }
      }

      // 📱 ОТПРАВЛЯЕМ TELEGRAM УВЕДОМЛЕНИЕ
      const telegramMessage = `
<b>🔴 ПОЗИЦИИ ЗАКРЫТЫ</b>
<b>Биржа:</b> Gate.io
<b>Символ:</b> ${symbol}
<b>Закрыто позиций:</b> ${closedPositions}/${openPositions.length}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendTelegramNotification(supabase, user_id, telegramMessage, 'close');

      return {
        closed_positions: closedPositions,
        total_positions_found: openPositions.length,
        close_results: closeResults,
        exchange: 'GATE',
        status: 'LIVE',
        message: `Закрытие позиций GATE.IO v4: ${closedPositions}/${openPositions.length} успешно`,
        api_version: 'GATE_V4',
        symbol: symbol,
        close_method: 'MARKET_ORDER_WITH_REDUCE_ONLY',
        api_endpoint: '/futures/usdt/orders'
      };
    }
    
    throw new Error(`Закрытие позиций для ${apiKey.exchange} не поддерживается`);

  } catch (error: any) {
    console.error('🔥 Close positions error:', error);
    throw new Error(`Ошибка закрытия позиций: ${error.message}`);
  }
}

async function placeTestOrder(apiKey: any, settings: any) {
  return { order_id: 'TEST_123', status: 'MOCK' };
}

// Функция задержки для rate limiting
async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}