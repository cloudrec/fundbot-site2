import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface FundingTradeRequest {
  action: 'start_funding_bot' | 'stop_funding_bot' | 'get_funding_time' | 'execute_funding_trade';
  exchange: 'bybit' | 'binance' | 'mexc' | 'gate' | 'kucoin';
  symbol?: string;
}

// Функция получения времени следующего фандинга
function getNextFundingTime(): Date {
  const now = new Date();
  const currentHour = now.getUTCHours();
  
  // Фандинг происходит каждые 8 часов: 00:00, 08:00, 16:00 UTC
  const fundingHours = [0, 8, 16];
  let nextFundingHour = fundingHours.find(hour => hour > currentHour);
  
  if (!nextFundingHour) {
    nextFundingHour = fundingHours[0]; // Следующий день
  }
  
  const nextFunding = new Date(now);
  nextFunding.setUTCHours(nextFundingHour, 0, 0, 0);
  
  // Если время уже прошло сегодня, переносим на завтра
  if (nextFunding <= now) {
    nextFunding.setUTCDate(nextFunding.getUTCDate() + 1);
  }
  
  return nextFunding;
}

// Функция проверки времени фандинга
function isFundingTime(delayMs: number = 5000): boolean {
  const now = new Date();
  const currentMinutes = now.getUTCMinutes();
  const currentSeconds = now.getUTCSeconds();
  const currentMs = now.getUTCMilliseconds();
  
  // Проверяем, прошло ли время фандинга + задержка
  const totalMs = (currentMinutes * 60 + currentSeconds) * 1000 + currentMs;
  const delayInMs = delayMs;
  
  // Фандинг происходит в 00:00, проверяем с задержкой
  return totalMs >= delayInMs && totalMs <= delayInMs + 60000; // 1 минута окно
}

// Функция создания подписи HMAC
async function createSignature(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Bybit API функции
async function bybitRequest(endpoint: string, params: any = {}, method: string = 'GET') {
  const apiKey = Deno.env.get('BYBIT_API_KEY');
  const apiSecret = Deno.env.get('BYBIT_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Bybit API credentials not found');
  }

  const timestamp = Date.now().toString();
  const baseUrl = 'https://api.bybit.com';
  
  let queryString = '';
  let body = '';
  
  if (method === 'GET') {
    queryString = new URLSearchParams(params).toString();
  } else {
    body = JSON.stringify(params);
  }
  
  const signString = timestamp + apiKey + '5000' + (queryString || body);
  const signature = await createSignature(apiSecret, signString);
  
  const headers = {
    'X-BAPI-API-KEY': apiKey,
    'X-BAPI-SIGN': signature,
    'X-BAPI-SIGN-TYPE': '2',
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-RECV-WINDOW': '5000',
    'Content-Type': 'application/json'
  };
  
  const url = method === 'GET' && queryString 
    ? `${baseUrl}${endpoint}?${queryString}`
    : `${baseUrl}${endpoint}`;
    
  const response = await fetch(url, {
    method,
    headers,
    body: method !== 'GET' ? body : undefined
  });
  
  return await response.json();
}

// Функция отправки Telegram уведомлений
async function sendTelegramNotification(message: string) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  
  if (!botToken || !chatId) {
    console.log('Telegram credentials not found, skipping notification');
    return;
  }
  
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
  }
}

// Функция выполнения торговли по фандингу
async function executeFundingTrade(supabaseClient: any, userId: string, exchange: string, symbol: string) {
  try {
    // Получаем настройки пользователя
    const { data: settings } = await supabaseClient
      .from('trading_settings_2025_11_06_12_23')
      .select('*')
      .eq('user_id', userId)
      .eq('exchange', exchange)
      .single();

    if (!settings || !settings.auto_trading_enabled) {
      throw new Error('Auto trading not enabled or settings not found');
    }

    // Ждем задержку после фандинга
    await new Promise(resolve => setTimeout(resolve, settings.funding_delay_ms));

    // Получаем текущую цену
    const tickerResponse = await bybitRequest('/v5/market/tickers', { category: 'linear', symbol });
    const currentPrice = parseFloat(tickerResponse.result.list[0].lastPrice);
    
    // Устанавливаем кредитное плечо
    await bybitRequest('/v5/position/set-leverage', {
      category: 'linear',
      symbol,
      buyLeverage: settings.leverage.toString(),
      sellLeverage: settings.leverage.toString()
    }, 'POST');

    // Расчет количества для шорт позиции
    const quantity = (settings.order_amount_usd / currentPrice).toFixed(6);
    
    // Размещение шорт ордера
    const shortOrderResult = await bybitRequest('/v5/order/create', {
      category: 'linear',
      symbol,
      side: 'Sell',
      orderType: 'Limit',
      qty: quantity,
      price: currentPrice.toString(),
      timeInForce: 'GTC'
    }, 'POST');

    if (shortOrderResult.retCode !== 0) {
      throw new Error(`Failed to place short order: ${shortOrderResult.retMsg}`);
    }

    // Расчет цен для TP и SL
    const takeProfitPrice = (currentPrice * (1 - settings.take_profit_percent / 100)).toFixed(2);
    const stopLossPrice = (currentPrice * (1 + settings.stop_loss_percent / 100)).toFixed(2);

    // Размещение Take Profit ордера
    const tpOrderResult = await bybitRequest('/v5/order/create', {
      category: 'linear',
      symbol,
      side: 'Buy',
      orderType: 'Limit',
      qty: quantity,
      price: takeProfitPrice,
      timeInForce: 'GTC',
      reduceOnly: true
    }, 'POST');

    // Размещение Stop Loss ордера
    const slOrderResult = await bybitRequest('/v5/order/create', {
      category: 'linear',
      symbol,
      side: 'Buy',
      orderType: 'StopMarket',
      qty: quantity,
      stopPrice: stopLossPrice,
      timeInForce: 'GTC',
      reduceOnly: true
    }, 'POST');

    // Сохранение ордера в базу данных
    await supabaseClient
      .from('trading_orders_2025_11_06_12_23')
      .insert({
        user_id: userId,
        exchange,
        symbol,
        order_id: shortOrderResult.result.orderId,
        side: 'sell',
        order_type: 'limit',
        quantity: parseFloat(quantity),
        price: currentPrice,
        amount_usd: settings.order_amount_usd,
        status: 'pending',
        take_profit_order_id: tpOrderResult.retCode === 0 ? tpOrderResult.result.orderId : null,
        stop_loss_order_id: slOrderResult.retCode === 0 ? slOrderResult.result.orderId : null,
        funding_time: new Date()
      });

    // Отправка уведомления
    await sendTelegramNotification(
      `💰 <b>Фандинг трейд выполнен!</b>\n\n` +
      `📊 Биржа: ${exchange.toUpperCase()}\n` +
      `💰 Пара: ${symbol}\n` +
      `📉 Шорт по цене: $${currentPrice}\n` +
      `💵 Сумма: $${settings.order_amount_usd}\n` +
      `⚡ Плечо: ${settings.leverage}x\n` +
      `🎯 Take Profit: $${takeProfitPrice}\n` +
      `🛑 Stop Loss: $${stopLossPrice}\n` +
      `⏰ Время: ${new Date().toISOString()}`
    );

    // Логирование
    await supabaseClient
      .from('trading_logs_2025_11_06_12_23')
      .insert({
        user_id: userId,
        exchange,
        action: 'funding_trade_executed',
        message: `Funding trade executed for ${symbol} at ${currentPrice}`,
        data: {
          symbol,
          price: currentPrice,
          quantity,
          takeProfitPrice,
          stopLossPrice,
          orderId: shortOrderResult.result.orderId
        }
      });

    return {
      success: true,
      orderId: shortOrderResult.result.orderId,
      price: currentPrice,
      quantity,
      takeProfitPrice,
      stopLossPrice
    };

  } catch (error) {
    // Логирование ошибки
    await supabaseClient
      .from('trading_logs_2025_11_06_12_23')
      .insert({
        user_id: userId,
        exchange,
        action: 'funding_trade_error',
        message: `Funding trade failed: ${error.message}`,
        level: 'error',
        data: { error: error.message }
      });

    await sendTelegramNotification(
      `❌ <b>Ошибка фандинг трейда</b>\n\n` +
      `📊 Биржа: ${exchange.toUpperCase()}\n` +
      `💰 Пара: ${symbol}\n` +
      `❌ Ошибка: ${error.message}\n` +
      `⏰ Время: ${new Date().toISOString()}`
    );

    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) {
      throw new Error('Unauthorized');
    }

    const requestData: FundingTradeRequest = await req.json();
    let result;

    switch (requestData.action) {
      case 'get_funding_time':
        const nextFunding = getNextFundingTime();
        const timeUntilFunding = nextFunding.getTime() - Date.now();
        
        result = {
          nextFundingTime: nextFunding.toISOString(),
          timeUntilFunding,
          isFundingTime: isFundingTime(),
          currentTime: new Date().toISOString()
        };
        break;

      case 'execute_funding_trade':
        if (!requestData.symbol) {
          throw new Error('Symbol is required for funding trade');
        }
        
        result = await executeFundingTrade(
          supabaseClient,
          user.id,
          requestData.exchange,
          requestData.symbol
        );
        break;

      case 'start_funding_bot':
        // Обновляем настройки для включения автоторговли
        await supabaseClient
          .from('trading_settings_2025_11_06_12_23')
          .upsert({
            user_id: user.id,
            exchange: requestData.exchange,
            auto_trading_enabled: true,
            updated_at: new Date().toISOString()
          });

        result = { message: 'Funding bot started', enabled: true };
        
        await sendTelegramNotification(
          `🤖 <b>Фандинг бот запущен</b>\n\n` +
          `📊 Биржа: ${requestData.exchange.toUpperCase()}\n` +
          `⏰ Следующий фандинг: ${getNextFundingTime().toISOString()}`
        );
        break;

      case 'stop_funding_bot':
        // Обновляем настройки для отключения автоторговли
        await supabaseClient
          .from('trading_settings_2025_11_06_12_23')
          .update({
            auto_trading_enabled: false,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('exchange', requestData.exchange);

        result = { message: 'Funding bot stopped', enabled: false };
        
        await sendTelegramNotification(
          `🛑 <b>Фандинг бот остановлен</b>\n\n` +
          `📊 Биржа: ${requestData.exchange.toUpperCase()}`
        );
        break;

      default:
        throw new Error(`Unknown action: ${requestData.action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Funding bot error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});