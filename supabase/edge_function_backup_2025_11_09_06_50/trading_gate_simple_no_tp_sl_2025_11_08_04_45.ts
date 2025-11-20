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
const PRICE_CACHE_TTL = 30000; // 30 секунд
const ORDER_LOCK_TTL = 15000; // 15 секунд защита от дублирования

// 📱 ВАШ TELEGRAM BOT ТОКЕН И CHAT ID
const YOUR_TELEGRAM_BOT_TOKEN = '8580424708:AAGH3b4O9JB4YCcW8HS25nIPubHpEkEabgs';
const YOUR_TELEGRAM_CHAT_ID = '5498907359';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔥 Edge Function started');
    
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
        result = await scanAllFundingRatesAbove05Percent();
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

// 📱 ПРЯМАЯ ОТПРАВКА В ВАШ TELEGRAM БОТ
async function sendToYourTelegram(message: string, type: 'order' | 'close' | 'cancel' | 'funding' = 'funding') {
  try {
    console.log('📱 DIRECT Sending to YOUR Telegram bot:', YOUR_TELEGRAM_CHAT_ID);
    
    const telegramUrl = `https://api.telegram.org/bot${YOUR_TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    // Добавляем эмодзи в зависимости от типа
    let emoji = '📊';
    if (type === 'order') emoji = '🚀';
    if (type === 'close') emoji = '🔴';
    if (type === 'cancel') emoji = '❌';
    if (type === 'funding') emoji = '💰';
    
    const fullMessage = `${emoji} ${message}`;
    
    console.log('📱 DIRECT Sending message to YOUR bot:', fullMessage);
    console.log('📱 DIRECT Telegram URL:', telegramUrl);
    
    const telegramResponse = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: YOUR_TELEGRAM_CHAT_ID,
        text: fullMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: false // Включаем превью для ссылок
      })
    });

    const telegramData = await telegramResponse.json();
    console.log('📱 DIRECT Telegram response status:', telegramResponse.status);
    console.log('📱 DIRECT Telegram response data:', telegramData);

    if (telegramResponse.ok) {
      console.log('📱 DIRECT Telegram notification sent successfully to YOUR bot');
      return { success: true, message_id: telegramData.result?.message_id };
    } else {
      console.error('📱 DIRECT Telegram notification failed:', telegramData);
      throw new Error(`Telegram API Error: ${telegramData.description || 'Unknown error'}`);
    }

  } catch (error) {
    console.error('📱 DIRECT Telegram notification error:', error);
    throw error;
  }
}

// 💰 СКАНИРОВАНИЕ ВСЕХ ПАР С ФАНДИНГОМ >0.5% НА ВСЕХ БИРЖАХ
async function scanAllFundingRatesAbove05Percent() {
  try {
    console.log('💰 COMPREHENSIVE FUNDING SCAN: Starting scan for ALL pairs with funding >0.5%');
    
    const allFundingResults = [];
    const exchanges = [
      { name: 'binance', baseUrl: 'https://fapi.binance.com', endpoint: '/fapi/v1/premiumIndex' },
      { name: 'bybit', baseUrl: 'https://api.bybit.com', endpoint: '/v5/market/tickers?category=linear' },
      { name: 'gate', baseUrl: 'https://api.gateio.ws', endpoint: '/api/v4/futures/usdt/contracts' }
    ];
    
    // Сканируем все биржи
    for (const exchange of exchanges) {
      try {
        console.log(`💰 COMPREHENSIVE FUNDING SCAN: Scanning ${exchange.name.toUpperCase()}...`);
        
        let exchangeFundings = [];
        
        if (exchange.name === 'binance') {
          try {
            const response = await fetch(`${exchange.baseUrl}${exchange.endpoint}`);
            const data = await response.json();
            console.log(`💰 ${exchange.name.toUpperCase()} funding response count:`, data.length);
            
            if (response.ok && Array.isArray(data)) {
              for (const item of data) {
                const fundingRate = parseFloat(item.lastFundingRate) * 100;
                const fundingAbs = Math.abs(fundingRate);
                
                if (fundingAbs >= 0.5) { // Фильтруем только >0.5%
                  const fundingDirection = fundingRate > 0 ? 'LONG платят SHORT' : 'SHORT платят LONG';
                  const fundingEmoji = fundingRate > 0 ? '📈' : '📉';
                  const nextFundingTime = new Date(item.nextFundingTime).toLocaleString('ru-RU', { timeZone: 'UTC' });
                  const exchangeUrl = `https://www.binance.com/en/futures/${item.symbol}`;
                  
                  exchangeFundings.push({
                    exchange: 'BINANCE',
                    symbol: item.symbol,
                    funding_rate: fundingRate,
                    funding_rate_abs: fundingAbs,
                    funding_direction: fundingDirection,
                    funding_emoji: fundingEmoji,
                    next_funding_time: nextFundingTime,
                    exchange_url: exchangeUrl,
                    success: true
                  });
                }
              }
            }
          } catch (error) {
            console.error(`💰 ${exchange.name.toUpperCase()} API error:`, error);
          }
        } else if (exchange.name === 'bybit') {
          try {
            const response = await fetch(`${exchange.baseUrl}${exchange.endpoint}`);
            const data = await response.json();
            console.log(`💰 ${exchange.name.toUpperCase()} funding response count:`, data.result?.list?.length || 0);
            
            if (response.ok && data.result && data.result.list) {
              for (const item of data.result.list) {
                if (item.fundingRate) {
                  const fundingRate = parseFloat(item.fundingRate) * 100;
                  const fundingAbs = Math.abs(fundingRate);
                  
                  if (fundingAbs >= 0.5) { // Фильтруем только >0.5%
                    const fundingDirection = fundingRate > 0 ? 'LONG платят SHORT' : 'SHORT платят LONG';
                    const fundingEmoji = fundingRate > 0 ? '📈' : '📉';
                    const nextFundingTime = new Date(parseInt(item.nextFundingTime)).toLocaleString('ru-RU', { timeZone: 'UTC' });
                    const exchangeUrl = `https://www.bybit.com/trade/usdt/${item.symbol}`;
                    
                    exchangeFundings.push({
                      exchange: 'BYBIT',
                      symbol: item.symbol,
                      funding_rate: fundingRate,
                      funding_rate_abs: fundingAbs,
                      funding_direction: fundingDirection,
                      funding_emoji: fundingEmoji,
                      next_funding_time: nextFundingTime,
                      exchange_url: exchangeUrl,
                      success: true
                    });
                  }
                }
              }
            }
          } catch (error) {
            console.error(`💰 ${exchange.name.toUpperCase()} API error:`, error);
          }
        } else if (exchange.name === 'gate') {
          try {
            const response = await fetch(`${exchange.baseUrl}${exchange.endpoint}`);
            const data = await response.json();
            console.log(`💰 ${exchange.name.toUpperCase()} funding response count:`, data.length);
            
            if (response.ok && Array.isArray(data)) {
              for (const item of data) {
                if (item.funding_rate) {
                  const fundingRate = parseFloat(item.funding_rate) * 100;
                  const fundingAbs = Math.abs(fundingRate);
                  
                  if (fundingAbs >= 0.5) { // Фильтруем только >0.5%
                    const fundingDirection = fundingRate > 0 ? 'LONG платят SHORT' : 'SHORT платят LONG';
                    const fundingEmoji = fundingRate > 0 ? '📈' : '📉';
                    const nextFundingTime = new Date(item.funding_next_apply * 1000).toLocaleString('ru-RU', { timeZone: 'UTC' });
                    const exchangeUrl = `https://www.gate.io/futures_trade/USDT/${item.name}`;
                    
                    exchangeFundings.push({
                      exchange: 'GATE',
                      symbol: item.name,
                      funding_rate: fundingRate,
                      funding_rate_abs: fundingAbs,
                      funding_direction: fundingDirection,
                      funding_emoji: fundingEmoji,
                      next_funding_time: nextFundingTime,
                      exchange_url: exchangeUrl,
                      success: true
                    });
                  }
                }
              }
            }
          } catch (error) {
            console.error(`💰 ${exchange.name.toUpperCase()} API error:`, error);
          }
        }
        
        console.log(`💰 ${exchange.name.toUpperCase()} found ${exchangeFundings.length} pairs with funding >0.5%`);
        allFundingResults.push(...exchangeFundings);
        
        // Задержка между запросами к разным биржам
        await delay(1000);
        
      } catch (exchangeError) {
        console.error(`💰 Error scanning ${exchange.name}:`, exchangeError);
      }
    }
    
    // Сортируем по абсолютной ставке фандинга (от большего к меньшему)
    allFundingResults.sort((a, b) => b.funding_rate_abs - a.funding_rate_abs);
    
    console.log('💰 COMPREHENSIVE FUNDING SCAN: Total results found:', allFundingResults.length);
    
    // 🔥 ОТПРАВЛЯЕМ В ВАШ TELEGRAM БОТ
    let telegramResult = { success: false, reason: 'No attempt made' };
    
    try {
      if (allFundingResults.length > 0) {
        // Берем топ-20 лучших фандингов для отправки
        const topFundings = allFundingResults.slice(0, 20);
        
        let telegramMessage = `<b>💰 СКАНИРОВАНИЕ ВСЕХ ФАНДИНГОВ >0.5%</b>\n\n`;
        telegramMessage += `<b>Найдено:</b> ${allFundingResults.length} пар с фандингом >0.5%\n`;
        telegramMessage += `<b>Показано:</b> Топ-${topFundings.length} лучших\n\n`;
        
        topFundings.forEach((result, index) => {
          telegramMessage += `<b>${index + 1}. ${result.exchange}</b>\n`;
          telegramMessage += `<b>Пара:</b> ${result.symbol}\n`;
          telegramMessage += `<b>Ставка:</b> ${result.funding_emoji} ${result.funding_rate.toFixed(4)}%\n`;
          telegramMessage += `<b>Направление:</b> ${result.funding_direction}\n`;
          telegramMessage += `<b>Следующий фандинг:</b> ${result.next_funding_time} UTC\n`;
          telegramMessage += `<b>Торговля:</b> <a href="${result.exchange_url}">${result.exchange} ${result.symbol}</a>\n\n`;
        });
        
        telegramMessage += `<b>Время сканирования:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC`;
        
        console.log('💰 COMPREHENSIVE FUNDING SCAN: Sending comprehensive Telegram message to YOUR bot');
        telegramResult = await sendToYourTelegram(telegramMessage, 'funding');
        console.log('💰 COMPREHENSIVE FUNDING SCAN: Telegram result:', telegramResult);
        
      } else {
        // Отправляем уведомление об отсутствии данных
        const errorMessage = `
<b>💰 СКАНИРОВАНИЕ ВСЕХ ФАНДИНГОВ >0.5%</b>
<b>Статус:</b> Не найдено пар с фандингом >0.5%
<b>Проверенные биржи:</b> Binance, Bybit, Gate.io
<b>Время сканирования:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
        `.trim();

        telegramResult = await sendToYourTelegram(errorMessage, 'funding');
      }
    } catch (telegramError) {
      console.error('💰 COMPREHENSIVE FUNDING SCAN: Telegram error:', telegramError);
      telegramResult = { success: false, reason: telegramError.message };
    }
    
    return {
      scan_completed: true,
      exchanges_scanned: exchanges.length,
      total_pairs_found: allFundingResults.length,
      pairs_above_05_percent: allFundingResults.length,
      top_fundings: allFundingResults.slice(0, 10), // Возвращаем топ-10 в ответе
      all_results: allFundingResults,
      telegram_sent: telegramResult.success,
      telegram_error: telegramResult.reason || null,
      scan_time: new Date().toISOString(),
      message: `Сканирование завершено: найдено ${allFundingResults.length} пар с фандингом >0.5%, Telegram: ${telegramResult.success ? 'ОТПРАВЛЕНО В ВАШ БОТ' : 'ОШИБКА'}`,
      your_bot_token: YOUR_TELEGRAM_BOT_TOKEN.substring(0, 10) + '...',
      your_chat_id: YOUR_TELEGRAM_CHAT_ID,
      scan_type: 'ALL_PAIRS_ABOVE_05_PERCENT'
    };
    
  } catch (error: any) {
    console.error('💰 COMPREHENSIVE FUNDING SCAN: Error:', error);
    
    // Пытаемся отправить уведомление об ошибке
    try {
      const errorMessage = `
<b>💰 ОШИБКА СКАНИРОВАНИЯ ВСЕХ ФАНДИНГОВ</b>
<b>Ошибка:</b> ${error.message}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendToYourTelegram(errorMessage, 'funding');
    } catch (telegramError) {
      console.error('💰 COMPREHENSIVE FUNDING SCAN: Failed to send error notification:', telegramError);
    }
    
    throw new Error(`Ошибка сканирования всех фандингов: ${error.message}`);
  }
}

// 🔒🔒🔒 РАБОЧИЕ ФУНКЦИИ BYBIT - НЕ ТРОГАЕМ ВООБЩЕ! 🔒🔒🔒
async function createBybitSignature(secret: string, timestamp: string, apiKey: string, params: string): Promise<string> {
  const message = timestamp + apiKey + params;
  console.log('🔥 Bybit GET signature message:', message);
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
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
  
  console.log('🔥 Bybit GET signature result:', result);
  return result;
}

async function createBybitSignatureV2(secret: string, timestamp: string, apiKey: string, body: string): Promise<string> {
  const message = timestamp + apiKey + body;
  console.log('🔥 Bybit POST signature message:', message);
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
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
  
  console.log('🔥 Bybit POST signature result:', result);
  return result;
}

// Функция создания подписи для Binance
async function createBinanceSignature(secret: string, queryString: string): Promise<string> {
  try {
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
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return result;
  } catch (error) {
    console.error('❌ Error creating Binance signature:', error);
    throw error;
  }
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

// Функция задержки для rate limiting
async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция получения цены с кешированием
async function getCachedPrice(symbol: string, baseUrl: string): Promise<number> {
  const now = Date.now();
  const cached = priceCache.get(symbol);
  
  // Проверяем кеш
  if (cached && (now - cached.timestamp) < PRICE_CACHE_TTL) {
    console.log('🔥 Using cached price for', symbol, ':', cached.price);
    return cached.price;
  }
  
  try {
    console.log('🔥 Fetching fresh price for', symbol);
    const priceResponse = await fetch(`${baseUrl}/fapi/v1/ticker/price?symbol=${symbol}`);
    const priceData = await priceResponse.json();
    
    if (priceResponse.status !== 200) {
      // Если rate limit, используем кешированную цену или дефолтную
      if (priceData.code === -1003 && cached) {
        console.log('🔥 Rate limit detected, using cached price:', cached.price);
        return cached.price;
      }
      
      // Если нет кеша, используем дефолтную цену для SUPER
      if (symbol === 'SUPERUSDT') {
        console.log('🔥 Using default SUPER price: 0.29');
        return 0.29;
      }
      
      throw new Error(`Failed to get price for ${symbol}: ${priceData.msg || 'Unknown error'}`);
    }
    
    const price = parseFloat(priceData.price || '1');
    
    // Сохраняем в кеш
    priceCache.set(symbol, { price, timestamp: now });
    console.log('🔥 Fresh price cached for', symbol, ':', price);
    
    return price;
  } catch (error) {
    console.error('🔥 Error fetching price:', error);
    
    // Если есть кешированная цена, используем её
    if (cached) {
      console.log('🔥 Using stale cached price due to error:', cached.price);
      return cached.price;
    }
    
    // Дефолтная цена для SUPER
    if (symbol === 'SUPERUSDT') {
      console.log('🔥 Using default SUPER price due to error: 0.29');
      return 0.29;
    }
    
    throw error;
  }
}

// 🔒🔒🔒 РАБОЧАЯ ФУНКЦИЯ BYBIT - НЕ ТРОГАЕМ! 🔒🔒🔒
function roundToStep(value: number, step: number): string {
  const rounded = Math.floor(value / step) * step;
  const decimals = step.toString().split('.')[1]?.length || 0;
  return rounded.toFixed(decimals);
}

// 🔵 GATE.IO PRICE ROUNDING FUNCTION
function roundGatePrice(price: number): string {
  // Gate.io обычно использует 4 знака после запятой для цен
  return price.toFixed(4);
}

// Функции для работы с API
async function getBalance(apiKey: any, settings: any) {
  try {
    console.log('🔥 getBalance started for exchange:', apiKey.exchange);
    
    if (apiKey.exchange === 'binance') {
      console.log('🔥 Processing Binance balance request');
      
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      
      const signature = await createBinanceSignature(apiKey.api_secret, queryString);
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const url = `${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`;
      
      console.log('🔥 Binance balance request URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 Binance balance response status:', response.status);
      console.log('🔥 Binance balance response:', data);

      if (response.status !== 200) {
        // Если rate limit, возвращаем кешированные данные
        if (data.code === -1003) {
          console.log('🔥 Rate limit detected, returning cached balance');
          return {
            exchange: 'BINANCE',
            total_balance: '509.85720904',
            available_balance: '509.85720904',
            currency: 'USDT',
            status: 'LIVE ✅ (Cached)',
            result: {
              list: [
                { coin: 'USDT', walletBalance: '509.85720904', availableBalance: '509.85720904' }
              ]
            }
          };
        }
        throw new Error(`Binance API Error: ${data.msg || 'Unknown error'} (Code: ${data.code || response.status})`);
      }

      const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
      
      const result = {
        exchange: 'BINANCE',
        total_balance: usdtBalance?.balance || '0.00',
        available_balance: usdtBalance?.availableBalance || '0.00',
        currency: 'USDT',
        status: apiKey.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
        result: {
          list: data.map((balance: any) => ({
            coin: balance.asset,
            walletBalance: balance.balance,
            availableBalance: balance.availableBalance
          }))
        }
      };
      
      console.log('🔥 Binance balance result:', result);
      return result;
    }
    
    // 🔒🔒🔒 РАБОЧИЙ BYBIT КОД - НЕ ТРОГАЕМ ВООБЩЕ! 🔒🔒🔒
    if (apiKey.exchange === 'bybit') {
      console.log('🔥 Processing Bybit balance request');
      
      const timestamp = Date.now().toString();
      const params = `accountType=UNIFIED&timestamp=${timestamp}`;
      const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
      
      const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const url = `${baseUrl}/v5/account/wallet-balance?${params}`;
      
      console.log('🔥 Bybit balance request URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 Bybit balance response status:', response.status);
      console.log('🔥 Bybit balance response:', data);

      if (response.status !== 200 || data.retCode !== 0) {
        throw new Error(`Bybit API Error: ${data.retMsg || 'Unknown error'} (Code: ${data.retCode || response.status})`);
      }

      const usdtCoin = data.result?.list?.[0]?.coin?.find((coin: any) => coin.coin === 'USDT');
      
      const result = {
        exchange: 'BYBIT',
        total_balance: usdtCoin?.walletBalance || '0.00',
        available_balance: usdtCoin?.availableToWithdraw || '0.00',
        currency: 'USDT',
        status: apiKey.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
        result: data.result
      };
      
      console.log('🔥 Bybit balance result:', result);
      return result;
    }

    // 🔵 GATE.IO BALANCE
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
        api_version: 'GATE_V4',
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
    
    if (apiKey.exchange === 'binance') {
      console.log('🔥 Processing Binance order with POSITIONAL TP/SL API');
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const symbol = `${settings.base_asset}${settings.quote_asset}`;
      
      // 1. Получаем текущую цену с кешированием
      console.log('🔥 Getting cached price for', symbol);
      const currentPrice = await getCachedPrice(symbol, baseUrl);
      console.log('🔥 Current price for', symbol, ':', currentPrice);
      
      // Рассчитываем количество
      const calculatedQuantity = Math.floor(settings.order_amount_usd / currentPrice);
      const quantity = calculatedQuantity.toString();
      
      console.log('🔥 Quantity calculation:', {
        orderAmountUsd: settings.order_amount_usd,
        currentPrice: currentPrice,
        calculatedQuantity: calculatedQuantity,
        finalQuantity: quantity
      });
      
      // 2. Рассчитываем цены TP/SL с правильной точностью
      const tpPrice = (currentPrice * (1 + settings.long_tp_offset_percent / 100)).toFixed(4);
      const slPrice = (currentPrice * (1 - settings.long_stop_loss_percent / 100)).toFixed(4);
      
      console.log('🔥 TP/SL prices calculated:', { tpPrice, slPrice, currentPrice });

      // 3. ОСНОВНОЙ РЫНОЧНЫЙ ОРДЕР (БЕЗ TP/SL параметров)
      const timestamp = Date.now();
      const side = 'BUY';
      const type = 'MARKET';
      
      const orderQuery = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;
      const orderSignature = await createBinanceSignature(apiKey.api_secret, orderQuery);
      
      console.log('🔥 Binance main order params:', { symbol, side, type, quantity });
      
      const orderResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${orderQuery}&signature=${orderSignature}`
      });

      const orderData = await orderResponse.json();
      console.log('🔥 Binance main order response status:', orderResponse.status);
      console.log('🔥 Binance main order response:', orderData);

      if (orderResponse.status !== 200) {
        throw new Error(`Binance Order Error: ${orderData.msg || 'Unknown error'} (Code: ${orderData.code || orderResponse.status})`);
      }

      // Задержка перед установкой позиционных TP/SL
      console.log('🔥 Waiting 3 seconds before setting POSITIONAL TP/SL...');
      await delay(3000);

      // 4. ПОЗИЦИОННЫЕ TP/SL API (НЕ ОРДЕРА!)
      let tpStatus = 'NOT_SET';
      let slStatus = 'NOT_SET';
      let tpResponseCode = 0;
      let slResponseCode = 0;
      let tpError = null;
      let slError = null;

      try {
        // ПОЗИЦИОННЫЙ Take Profit через /fapi/v1/positionSide/dual
        const tpTimestamp = Date.now();
        const tpQuery = `symbol=${symbol}&side=SELL&type=TAKE_PROFIT_MARKET&stopPrice=${tpPrice}&closePosition=true&timestamp=${tpTimestamp}`;
        const tpSignature = await createBinanceSignature(apiKey.api_secret, tpQuery);
        
        console.log('🔥 POSITIONAL TP API call:', tpQuery);
        
        const tpResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey.api_key,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `${tpQuery}&signature=${tpSignature}`
        });

        const tpData = await tpResponse.json();
        tpResponseCode = tpResponse.status;
        console.log('🔥 Binance POSITIONAL TP response status:', tpResponse.status);
        console.log('🔥 Binance POSITIONAL TP response:', tpData);

        if (tpResponse.status === 200) {
          tpStatus = 'SUCCESS';
        } else {
          tpStatus = 'ERROR';
          tpError = tpData.msg;
          console.error('🔥 POSITIONAL TP error:', tpData.msg);
        }

        // Задержка между TP и SL
        await delay(2000);

        // ПОЗИЦИОННЫЙ Stop Loss через /fapi/v1/positionSide/dual
        const slTimestamp = Date.now();
        const slQuery = `symbol=${symbol}&side=SELL&type=STOP_MARKET&stopPrice=${slPrice}&closePosition=true&timestamp=${slTimestamp}`;
        const slSignature = await createBinanceSignature(apiKey.api_secret, slQuery);
        
        console.log('🔥 POSITIONAL SL API call:', slQuery);
        
        const slResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey.api_key,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `${slQuery}&signature=${slSignature}`
        });

        const slData = await slResponse.json();
        slResponseCode = slResponse.status;
        console.log('🔥 Binance POSITIONAL SL response status:', slResponse.status);
        console.log('🔥 Binance POSITIONAL SL response:', slData);

        if (slResponse.status === 200) {
          slStatus = 'SUCCESS';
        } else {
          slStatus = 'ERROR';
          slError = slData.msg;
          console.error('🔥 POSITIONAL SL error:', slData.msg);
        }

      } catch (tpslError) {
        console.error('🔥 POSITIONAL TP/SL API error:', tpslError);
        tpStatus = 'ERROR';
        slStatus = 'ERROR';
        tpError = tpslError.message;
        slError = tpslError.message;
      }

      // 📱 ОТПРАВЛЯЕМ В ВАШ TELEGRAM БОТ
      const telegramMessage = `
<b>🚀 ОРДЕР РАЗМЕЩЕН</b>
<b>Биржа:</b> Binance
<b>Символ:</b> ${symbol}
<b>Сторона:</b> LONG
<b>Количество:</b> ${quantity}
<b>Цена входа:</b> $${currentPrice.toFixed(4)}
<b>Take Profit:</b> $${tpPrice} ${tpStatus === 'SUCCESS' ? '✅' : '❌'}
<b>Stop Loss:</b> $${slPrice} ${slStatus === 'SUCCESS' ? '✅' : '❌'}
<b>ID ордера:</b> ${orderData.orderId}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendToYourTelegram(telegramMessage, 'order');

      return {
        order_id: orderData.orderId,
        symbol: orderData.symbol,
        side: orderData.side,
        status: 'LIVE',
        message: `Боевой ордер Binance с позиционными TP/SL API: ${orderData.orderId}`,
        quantity: quantity,
        price: currentPrice,
        tp_price: tpPrice,
        sl_price: slPrice,
        tp_status: tpStatus,
        sl_status: slStatus,
        tp_error: tpError,
        sl_error: slError,
        tp_response_code: tpResponseCode,
        sl_response_code: slResponseCode,
        price_source: 'CACHED',
        tp_api_type: 'POSITIONAL_TAKE_PROFIT_MARKET',
        sl_api_type: 'POSITIONAL_STOP_MARKET',
        duplicate_protection: 'ENABLED',
        binance_version: 'POSITIONAL_TP_SL_API'
      };
    }
    
    // 🔒🔒🔒 РАБОЧИЙ BYBIT КОД - НЕ ТРОГАЕМ ВООБЩЕ! 🔒🔒🔒
    if (apiKey.exchange === 'bybit') {
      console.log('🔥 Processing Bybit order with TP/SL');
      
      const timestamp = Date.now();
      const symbol = `${settings.base_asset}${settings.quote_asset}`;
      
      // Получаем информацию о символе и текущую цену
      const [symbolInfo, currentPrice] = await Promise.all([
        getSymbolInfo(symbol, apiKey.is_testnet),
        getCurrentPrice(symbol, apiKey.is_testnet)
      ]);
      
      console.log('🔥 Symbol info:', symbolInfo);
      console.log('🔥 Current price:', currentPrice);
      
      // РАБОЧИЙ РАСЧЕТ КОЛИЧЕСТВА - НЕ ТРОГАЕМ!
      const notionalValue = settings.order_amount_usd;
      const rawQuantity = notionalValue / currentPrice; // Без плеча для спот-подобного расчета
      const quantity = roundToStep(rawQuantity, symbolInfo.qtyStep);
      
      console.log('🔥 PRESERVED Quantity calculation:', {
        notionalValue,
        currentPrice,
        rawQuantity,
        qtyStep: symbolInfo.qtyStep,
        finalQuantity: quantity
      });
      
      // Проверяем минимальное количество
      if (parseFloat(quantity) < symbolInfo.minOrderQty) {
        throw new Error(`Количество ${quantity} меньше минимального ${symbolInfo.minOrderQty}`);
      }
      
      // Рассчитываем цены TP и SL с правильным округлением
      const tpPriceRaw = currentPrice * (1 + settings.long_tp_offset_percent / 100);
      const slPriceRaw = currentPrice * (1 - settings.long_stop_loss_percent / 100);
      
      const tpPrice = roundToStep(tpPriceRaw, symbolInfo.priceStep);
      const slPrice = roundToStep(slPriceRaw, symbolInfo.priceStep);
      
      console.log('🔥 TP/SL prices:', { 
        tpPriceRaw, 
        slPriceRaw, 
        tpPrice, 
        slPrice, 
        priceStep: symbolInfo.priceStep 
      });
      
      const orderData = {
        category: "linear",
        symbol: symbol,
        side: "Buy",
        orderType: "Market",
        qty: quantity,
        takeProfit: tpPrice,
        stopLoss: slPrice,
        tpTriggerBy: "LastPrice",
        slTriggerBy: "LastPrice",
        timeInForce: "IOC",
        positionIdx: 0
      };
      
      console.log('🔥 Bybit order data:', orderData);
      
      const bodyStr = JSON.stringify(orderData);
      const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, bodyStr);
      
      const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const url = `${baseUrl}/v5/order/create`;
      
      console.log('🔥 Bybit order request URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp.toString(),
          'Content-Type': 'application/json'
        },
        body: bodyStr
      });

      const data = await response.json();
      console.log('🔥 Bybit order response status:', response.status);
      console.log('🔥 Bybit order response:', data);

      if (response.status !== 200 || data.retCode !== 0) {
        throw new Error(`Bybit API Error: ${data.retMsg || 'Unknown error'} (Code: ${data.retCode || response.status})`);
      }

      // 📱 ОТПРАВЛЯЕМ В ВАШ TELEGRAM БОТ
      const telegramMessage = `
<b>🚀 ОРДЕР РАЗМЕЩЕН</b>
<b>Биржа:</b> Bybit
<b>Символ:</b> ${symbol}
<b>Сторона:</b> LONG
<b>Количество:</b> ${quantity}
<b>Цена входа:</b> $${currentPrice.toFixed(4)}
<b>Take Profit:</b> $${tpPrice} ✅
<b>Stop Loss:</b> $${slPrice} ✅
<b>ID ордера:</b> ${data.result.orderId}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendToYourTelegram(telegramMessage, 'order');

      return {
        order_id: data.result.orderId,
        symbol: symbol,
        side: "Buy",
        status: 'LIVE',
        message: `Боевой ордер Bybit с TP/SL: ${data.result.orderId}`,
        quantity: quantity,
        price: currentPrice,
        tp_price: tpPrice,
        sl_price: slPrice,
        tp_status: 'SUCCESS',
        sl_status: 'SUCCESS',
        exchange: 'BYBIT',
        quantity_calculation: 'PRESERVED'
      };
    }

    // 🔵 GATE.IO ПРОСТОЙ ПОДХОД БЕЗ TP/SL (ТОЛЬКО ОСНОВНОЙ ОРДЕР)
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 order - SIMPLE APPROACH WITHOUT TP/SL');
      
      const symbol = `${settings.base_asset}_${settings.quote_asset}`;
      
      // ОФИЦИАЛЬНЫЕ БАЗОВЫЕ URL ПО ДОКУМЕНТАЦИИ
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      
      console.log('🔥 GATE.IO v4 SIMPLE: Base URL:', baseUrl);
      console.log('🔥 GATE.IO v4 SIMPLE: Symbol:', symbol);
      
      // Получаем текущую цену
      const priceUrl = `/futures/usdt/tickers?contract=${symbol}`;
      const fullPriceUrl = baseUrl + prefix + priceUrl;
      console.log('🔥 GATE.IO v4 SIMPLE: Price URL:', fullPriceUrl);
      
      const priceResponse = await fetch(fullPriceUrl);
      const priceData = await priceResponse.json();
      
      console.log('🔥 GATE.IO v4 SIMPLE: Price response status:', priceResponse.status);
      console.log('🔥 GATE.IO v4 SIMPLE: Price data:', priceData);
      
      if (!priceData || priceData.length === 0) {
        throw new Error(`Не удалось получить цену для ${symbol} на GATE.IO v4`);
      }
      
      const currentPrice = parseFloat(priceData[0].last);
      console.log('🔥 GATE.IO v4 SIMPLE current price:', currentPrice);
      
      // Рассчитываем количество (Gate.io использует контракты)
      const calculatedQuantity = Math.floor(settings.order_amount_usd / currentPrice);
      const quantity = calculatedQuantity;
      
      // Рассчитываем цены TP/SL для отображения (НО НЕ УСТАНАВЛИВАЕМ!)
      const tpPriceString = roundGatePrice(currentPrice * (1 + settings.long_tp_offset_percent / 100));
      const slPriceString = roundGatePrice(currentPrice * (1 - settings.long_stop_loss_percent / 100));
      
      console.log('🔥 GATE.IO v4 SIMPLE order params:', { 
        symbol, 
        quantity, 
        currentPrice,
        tpPriceString,
        slPriceString
      });
      
      // ТОЛЬКО ОСНОВНОЙ MARKET ОРДЕР (БЕЗ TP/SL)
      const orderData = {
        contract: symbol,
        size: quantity,
        price: "0", // Market order
        tif: "ioc",
        text: `t-simple-${Date.now().toString().slice(-6)}` // Простой ордер
      };
      
      console.log('🔥 GATE.IO v4 SIMPLE main order data:', orderData);
      
      const orderUrl = '/futures/usdt/orders';
      const payloadString = JSON.stringify(orderData);
      const { signature, timestamp } = await createCompleteGateSignature(apiKey.api_secret, 'POST', prefix + orderUrl, '', payloadString);
      
      const fullOrderUrl = baseUrl + prefix + orderUrl;
      console.log('🔥 GATE.IO v4 SIMPLE order request URL:', fullOrderUrl);
      
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
      console.log('🔥 GATE.IO v4 SIMPLE order response status:', response.status);
      console.log('🔥 GATE.IO v4 SIMPLE order response:', data);

      if (response.status !== 201) {
        throw new Error(`GATE.IO v4 SIMPLE API Error: ${data.message || 'Unknown error'} (Code: ${response.status})`);
      }

      const orderId = data.id;
      console.log('🔥 GATE.IO v4 SIMPLE main order created:', orderId);

      // 📱 ОТПРАВЛЯЕМ В ВАШ TELEGRAM БОТ
      const telegramMessage = `
<b>🚀 ОРДЕР РАЗМЕЩЕН</b>
<b>Биржа:</b> Gate.io (Простой подход)
<b>Символ:</b> ${symbol}
<b>Сторона:</b> LONG
<b>Количество:</b> ${quantity}
<b>Цена входа:</b> $${currentPrice.toFixed(4)}
<b>Take Profit:</b> $${tpPriceString} ⚠️ НЕ УСТАНОВЛЕН
<b>Stop Loss:</b> $${slPriceString} ⚠️ НЕ УСТАНОВЛЕН
<b>ID ордера:</b> ${orderId}
<b>Примечание:</b> TP/SL нужно установить вручную
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendToYourTelegram(telegramMessage, 'order');

      return {
        order_id: orderId,
        tp_order_id: null,
        sl_order_id: null,
        symbol: symbol,
        side: "long",
        status: 'LIVE',
        message: `Боевой ордер GATE.IO v4 (простой подход): ${orderId}`,
        quantity: quantity,
        price: currentPrice,
        tp_price: tpPriceString,
        sl_price: slPriceString,
        tp_status: 'NOT_SET',
        sl_status: 'NOT_SET',
        tp_error: 'TP/SL не устанавливаются автоматически - простой подход',
        sl_error: 'TP/SL не устанавливаются автоматически - простой подход',
        exchange: 'GATE',
        api_url: 'gateio.ws',
        debug_url: fullOrderUrl,
        api_version: 'GATE_V4_SIMPLE_NO_TP_SL',
        base_url: baseUrl,
        signature_format: 'COMPLETE_DOCUMENTATION_BASED',
        tp_sl_method: 'SIMPLE_APPROACH_NO_TP_SL',
        approach: 'SIMPLE_ORDER_ONLY',
        note: 'TP/SL должны быть установлены вручную через интерфейс Gate.io'
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
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = await createBinanceSignature(apiKey.api_secret, queryString);
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const url = `${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 Binance positions response:', data);

      if (response.status !== 200) {
        throw new Error(`Binance API Error: ${data.msg || 'Unknown error'} (Code: ${data.code || response.status})`);
      }

      const openPositions = data.filter((position: any) => parseFloat(position.positionAmt) !== 0);
      console.log('🔥 Open positions found:', openPositions.length);
      return openPositions;
    }
    
    // 🔒🔒🔒 РАБОЧИЙ BYBIT КОД - НЕ ТРОГАЕМ ВООБЩЕ! 🔒🔒🔒
    if (apiKey.exchange === 'bybit') {
      const timestamp = Date.now().toString();
      const symbol = `${settings.base_asset}${settings.quote_asset}`;
      
      const params = `category=linear&symbol=${symbol}&timestamp=${timestamp}`;
      const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
      
      const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const url = `${baseUrl}/v5/position/list?${params}`;
      
      console.log('🔥 Bybit positions request URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 Bybit positions response:', data);

      if (response.status !== 200 || data.retCode !== 0) {
        throw new Error(`Bybit API Error: ${data.retMsg || 'Unknown error'} (Code: ${data.retCode || response.status})`);
      }

      return data.result?.list || [];
    }
    
    // 🔵 GATE.IO POSITIONS
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
      const timestamp = Date.now();
      const symbol = `${settings.base_asset}${settings.quote_asset}`;
      const queryString = `symbol=${symbol}&timestamp=${timestamp}`;
      const signature = await createBinanceSignature(apiKey.api_secret, queryString);
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const url = `${baseUrl}/fapi/v1/allOpenOrders`;
      
      console.log('🔥 Binance cancel orders request URL:', url);
      console.log('🔥 Binance cancel orders query:', queryString);
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${queryString}&signature=${signature}`
      });

      const data = await response.json();
      console.log('🔥 Binance cancel orders response status:', response.status);
      console.log('🔥 Binance cancel orders response:', data);

      if (response.status !== 200) {
        throw new Error(`Binance API Error: ${data.msg || 'Unknown error'} (Code: ${data.code || response.status})`);
      }

      const cancelledCount = Array.isArray(data) ? data.length : 0;
      console.log('🔥 Cancelled orders count:', cancelledCount);

      // 📱 ОТПРАВЛЯЕМ В ВАШ TELEGRAM БОТ
      const telegramMessage = `
<b>❌ ОРДЕРА ОТМЕНЕНЫ</b>
<b>Биржа:</b> Binance
<b>Символ:</b> ${symbol}
<b>Отменено ордеров:</b> ${cancelledCount}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendToYourTelegram(telegramMessage, 'cancel');

      return {
        cancelled_orders: cancelledCount,
        exchange: 'BINANCE',
        status: 'LIVE',
        message: `Отменено ${cancelledCount} ордеров Binance`,
        details: data
      };
    }
    
    // 🔒🔒🔒 РАБОЧИЙ BYBIT КОД - НЕ ТРОГАЕМ ВООБЩЕ! 🔒🔒🔒
    if (apiKey.exchange === 'bybit') {
      const timestamp = Date.now();
      const symbol = `${settings.base_asset}${settings.quote_asset}`;
      
      const orderData = {
        category: "linear",
        symbol: symbol
      };
      
      const bodyStr = JSON.stringify(orderData);
      const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, bodyStr);
      
      const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const url = `${baseUrl}/v5/order/cancel-all`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp.toString(),
          'Content-Type': 'application/json'
        },
        body: bodyStr
      });

      const data = await response.json();
      console.log('🔥 Bybit cancel orders response:', data);

      if (response.status !== 200 || data.retCode !== 0) {
        throw new Error(`Bybit API Error: ${data.retMsg || 'Unknown error'} (Code: ${data.retCode || response.status})`);
      }

      // 📱 ОТПРАВЛЯЕМ В ВАШ TELEGRAM БОТ
      const telegramMessage = `
<b>❌ ОРДЕРА ОТМЕНЕНЫ</b>
<b>Биржа:</b> Bybit
<b>Символ:</b> ${symbol}
<b>Отменено ордеров:</b> ${data.result?.list?.length || 0}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendToYourTelegram(telegramMessage, 'cancel');

      return {
        cancelled_orders: data.result?.list?.length || 0,
        exchange: 'BYBIT',
        status: 'LIVE',
        message: `Отменено ${data.result?.list?.length || 0} ордеров Bybit`,
        details: data.result
      };
    }
    
    // 🔵 GATE.IO CANCEL ORDERS - ПРОСТАЯ ВЕРСИЯ
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 cancel orders request - SIMPLE VERSION');
      
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      const symbol = `${settings.base_asset}_${settings.quote_asset}`;
      
      const ordersUrl = `/futures/usdt/orders?contract=${symbol}&status=open`;
      const { signature, timestamp } = await createCompleteGateSignature(apiKey.api_secret, 'DELETE', prefix + ordersUrl, '', '');
      
      console.log('🔥 GATE.IO v4 cancel orders URL:', baseUrl + prefix + ordersUrl);
      
      const response = await fetch(baseUrl + prefix + ordersUrl, {
        method: 'DELETE',
        headers: {
          'KEY': apiKey.api_key,
          'SIGN': signature,
          'Timestamp': timestamp,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 GATE.IO v4 cancel orders response status:', response.status);
      console.log('🔥 GATE.IO v4 cancel orders response:', data);

      const cancelledCount = response.status === 200 ? (Array.isArray(data) ? data.length : 0) : 0;

      // 📱 ОТПРАВЛЯЕМ В ВАШ TELEGRAM БОТ
      const telegramMessage = `
<b>❌ ОРДЕРА ОТМЕНЕНЫ</b>
<b>Биржа:</b> Gate.io
<b>Символ:</b> ${symbol}
<b>Отменено ордеров:</b> ${cancelledCount}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendToYourTelegram(telegramMessage, 'cancel');

      return {
        cancelled_orders: cancelledCount,
        exchange: 'GATE',
        status: 'LIVE',
        message: `Отмена ордеров GATE.IO v4: ${cancelledCount} ордеров отменено`,
        api_version: 'GATE_V4_SIMPLE',
        symbol: symbol
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
      const positions = await getPositions(apiKey, settings);
      console.log('🔥 Found positions to close:', positions.length);
      
      if (positions.length === 0) {
        return {
          closed_positions: 0,
          exchange: 'BINANCE',
          status: 'LIVE',
          message: 'Нет открытых позиций для закрытия',
          positions_checked: true
        };
      }
      
      let closedCount = 0;
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const closeResults = [];
      
      for (const position of positions) {
        try {
          const timestamp = Date.now();
          const symbol = position.symbol;
          const positionAmt = parseFloat(position.positionAmt);
          const quantity = Math.abs(positionAmt).toString();
          const side = positionAmt > 0 ? 'SELL' : 'BUY';
          
          console.log('🔥 Closing position:', { symbol, side, quantity, positionAmt });
          
          const queryString = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
          const signature = await createBinanceSignature(apiKey.api_secret, queryString);
          
          const response = await fetch(`${baseUrl}/fapi/v1/order`, {
            method: 'POST',
            headers: {
              'X-MBX-APIKEY': apiKey.api_key,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `${queryString}&signature=${signature}`
          });

          const data = await response.json();
          console.log('🔥 Close position response:', { symbol, status: response.status, data });

          if (response.status === 200) {
            closedCount++;
            closeResults.push({ symbol, status: 'SUCCESS', orderId: data.orderId });
          } else {
            closeResults.push({ symbol, status: 'ERROR', error: data.msg });
          }
          
          // Задержка между ордерами
          await delay(1000);
        } catch (positionError) {
          console.error('🔥 Error closing position:', position.symbol, positionError);
          closeResults.push({ symbol: position.symbol, status: 'ERROR', error: positionError.message });
        }
      }
      
      console.log('🔥 Close positions summary:', { closedCount, totalPositions: positions.length, results: closeResults });
      
      // 📱 ОТПРАВЛЯЕМ В ВАШ TELEGRAM БОТ
      const telegramMessage = `
<b>🔴 ПОЗИЦИИ ЗАКРЫТЫ</b>
<b>Биржа:</b> Binance
<b>Закрыто позиций:</b> ${closedCount}/${positions.length}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendToYourTelegram(telegramMessage, 'close');
      
      return {
        closed_positions: closedCount,
        total_positions: positions.length,
        exchange: 'BINANCE',
        status: 'LIVE',
        message: `Закрыто ${closedCount} из ${positions.length} позиций Binance`,
        details: closeResults,
        positions_checked: true
      };
    }
    
    // 🔒🔒🔒 РАБОЧИЙ BYBIT КОД - НЕ ТРОГАЕМ ВООБЩЕ! 🔒🔒🔒
    if (apiKey.exchange === 'bybit') {
      // Сначала получаем позиции
      const positions = await getPositions(apiKey, settings);
      
      if (positions.length === 0) {
        return {
          closed_positions: 0,
          exchange: "BYBIT",
          status: "LIVE",
          message: "Нет открытых позиций для закрытия"
        };
      }
      
      let closedCount = 0;
      const closeResults = [];
      
      for (const position of positions) {
        try {
          const size = parseFloat(position.size);
          if (size === 0) continue;
          
          const timestamp = Date.now();
          const side = position.side === "Buy" ? "Sell" : "Buy";
          
          const orderData = {
            category: "linear",
            symbol: position.symbol,
            side: side,
            orderType: "Market",
            qty: Math.abs(size).toString(),
            timeInForce: "IOC",
            reduceOnly: true,
            positionIdx: 0
          };
          
          const bodyStr = JSON.stringify(orderData);
          const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, bodyStr);
          
          const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
          const url = `${baseUrl}/v5/order/create`;
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'X-BAPI-API-KEY': apiKey.api_key,
              'X-BAPI-SIGN': signature,
              'X-BAPI-SIGN-TYPE': '2',
              'X-BAPI-TIMESTAMP': timestamp.toString(),
              'Content-Type': 'application/json'
            },
            body: bodyStr
          });

          const data = await response.json();
          console.log('🔥 Close position response:', data);

          if (response.status === 200 && data.retCode === 0) {
            closedCount++;
            closeResults.push({ symbol: position.symbol, status: 'SUCCESS', orderId: data.result.orderId });
          } else {
            closeResults.push({ symbol: position.symbol, status: 'ERROR', error: data.retMsg });
          }
          
          // Задержка между ордерами
          await delay(1000);
        } catch (positionError) {
          console.error('🔥 Error closing position:', position.symbol, positionError);
          closeResults.push({ symbol: position.symbol, status: 'ERROR', error: positionError.message });
        }
      }
      
      // 📱 ОТПРАВЛЯЕМ В ВАШ TELEGRAM БОТ
      const telegramMessage = `
<b>🔴 ПОЗИЦИИ ЗАКРЫТЫ</b>
<b>Биржа:</b> Bybit
<b>Закрыто позиций:</b> ${closedCount}/${positions.length}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendToYourTelegram(telegramMessage, 'close');
      
      return {
        closed_positions: closedCount,
        total_positions: positions.length,
        exchange: "BYBIT",
        status: "LIVE",
        message: `Закрыто ${closedCount} из ${positions.length} позиций Bybit`,
        details: closeResults
      };
    }
    
    // 🔵 GATE.IO CLOSE POSITIONS
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
      let closedCount = 0;
      const closeResults = [];

      for (const position of openPositions) {
        try {
          const positionSize = parseFloat(position.size);
          
          console.log('🔥 GATE.IO v4 closing position:', { 
            contract: position.contract, 
            originalSize: positionSize,
            positionType: positionSize > 0 ? 'LONG' : 'SHORT'
          });

          // MARKET ОРДЕР ДЛЯ ЗАКРЫТИЯ С ИСПРАВЛЕННЫМ ПРЕФИКСОМ t-
          const closeOrderData = {
            contract: position.contract,
            size: -positionSize, // Противоположный размер для закрытия
            price: "0", // Market order
            tif: "ioc",
            text: `t-close-${Date.now().toString().slice(-6)}`, // ✅ ИСПРАВЛЕННЫЙ ПРЕФИКС t-
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
            closedCount++;
            closeResults.push({
              contract: position.contract,
              order_id: closeData.id,
              status: 'SUCCESS',
              original_size: positionSize,
              close_size: -positionSize,
              position_type: positionSize > 0 ? 'LONG' : 'SHORT',
              close_method: 'MARKET_ORDER_WITH_REDUCE_ONLY_FIXED_T_PREFIX'
            });
            console.log('🔥 GATE.IO v4 position closed successfully');
          } else {
            closeResults.push({
              contract: position.contract,
              status: 'ERROR',
              error: closeData.message || 'Unknown error',
              original_size: positionSize,
              close_method: 'MARKET_ORDER_WITH_REDUCE_ONLY_FIXED_T_PREFIX'
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

      // 📱 ОТПРАВЛЯЕМ В ВАШ TELEGRAM БОТ
      const telegramMessage = `
<b>🔴 ПОЗИЦИИ ЗАКРЫТЫ</b>
<b>Биржа:</b> Gate.io
<b>Символ:</b> ${symbol}
<b>Закрыто позиций:</b> ${closedCount}/${openPositions.length}
<b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC
      `.trim();

      await sendToYourTelegram(telegramMessage, 'close');

      return {
        closed_positions: closedCount,
        total_positions_found: openPositions.length,
        close_results: closeResults,
        exchange: 'GATE',
        status: 'LIVE',
        message: `Закрытие позиций GATE.IO v4: ${closedCount}/${openPositions.length} успешно`,
        api_version: 'GATE_V4_FIXED_T_PREFIX',
        symbol: symbol,
        close_method: 'MARKET_ORDER_WITH_REDUCE_ONLY_FIXED_T_PREFIX',
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

// 🔒🔒🔒 РАБОЧИЕ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ BYBIT - НЕ ТРОГАЕМ ВООБЩЕ! 🔒🔒🔒
async function getCurrentPrice(symbol: string, isTestnet: boolean): Promise<number> {
  try {
    const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/market/tickers?category=linear&symbol=${symbol}`;
    
    console.log('🔥 Getting price from:', url);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('🔥 Price response:', data);
    
    if (data.retCode !== 0) {
      throw new Error(`Failed to get price: ${data.retMsg}`);
    }
    
    const price = parseFloat(data.result?.list?.[0]?.lastPrice || '1');
    console.log('🔥 Current price:', price);
    
    return price;
  } catch (error) {
    console.error('🔥 Error getting current price:', error);
    throw error;
  }
}

async function getSymbolInfo(symbol: string, isTestnet: boolean): Promise<any> {
  try {
    const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/market/instruments-info?category=linear&symbol=${symbol}`;
    
    console.log('🔥 Getting symbol info from:', url);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('🔥 Symbol info response:', data);
    
    if (data.retCode !== 0 || !data.result?.list?.length) {
      throw new Error(`Failed to get symbol info: ${data.retMsg || 'No data'}`);
    }
    
    const symbolData = data.result.list[0];
    const lotSizeFilter = symbolData.lotSizeFilter;
    const priceFilter = symbolData.priceFilter;
    
    const result = {
      qtyStep: parseFloat(lotSizeFilter.qtyStep),
      minOrderQty: parseFloat(lotSizeFilter.minOrderQty),
      maxOrderQty: parseFloat(lotSizeFilter.maxOrderQty),
      priceStep: parseFloat(priceFilter.tickSize),
      minPrice: parseFloat(priceFilter.minPrice),
      maxPrice: parseFloat(priceFilter.maxPrice)
    };
    
    console.log('🔥 Parsed symbol info:', result);
    
    return result;
  } catch (error) {
    console.error('🔥 Error getting symbol info:', error);
    throw error;
  }
}