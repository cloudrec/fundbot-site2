import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface HourlyTradeRequest {
  action: 'start_hourly_bot' | 'stop_hourly_bot' | 'get_next_hour_time' | 'execute_hourly_trade' | 'toggle_trading';
  exchange: 'bybit' | 'binance' | 'mexc' | 'gate' | 'kucoin';
  symbol?: string;
  enabled?: boolean;
}

// Функция получения времени следующего часа (с задержкой)
function getNextHourTime(delayMs: number = 5000): Date {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0); // Следующий час, 0 минут, 0 секунд
  nextHour.setMilliseconds(delayMs); // Добавляем задержку
  return nextHour;
}

// Функция проверки времени торговли (каждый час)
function isHourlyTradingTime(delayMs: number = 5000): boolean {
  const now = new Date();
  const currentMinutes = now.getMinutes();
  const currentSeconds = now.getSeconds();
  const currentMs = now.getMilliseconds();
  
  // Проверяем, прошло ли время начала часа + задержка
  const totalMs = (currentMinutes * 60 + currentSeconds) * 1000 + currentMs;
  const delayInMs = delayMs;
  
  // Торговля происходит в начале каждого часа, проверяем с задержкой
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

// Функция проверки выполнения TP и размещения лонг ордера
async function checkTPAndPlaceLong(supabaseClient: any, userId: string, exchange: string, symbol: string) {
  try {
    // Получаем последние шорт ордера пользователя
    const { data: shortOrders } = await supabaseClient
      .from('trading_orders_2025_11_06_12_23')
      .select('*')
      .eq('user_id', userId)
      .eq('exchange', exchange)
      .eq('symbol', symbol)
      .eq('side', 'sell')
      .eq('status', 'filled')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!shortOrders || shortOrders.length === 0) {
      return null;
    }

    // Получаем текущие позиции
    const positions = await bybitRequest('/v5/position/list', { category: 'linear', symbol });
    
    // Проверяем, есть ли открытые шорт позиции
    const hasOpenShort = positions.result.list.some((pos: any) => 
      pos.symbol === symbol && pos.side === 'Sell' && parseFloat(pos.size) > 0
    );

    // Если шорт позиций нет, значит TP сработал
    if (!hasOpenShort) {
      const lastShortOrder = shortOrders[0];
      
      // Проверяем, не размещали ли уже лонг ордер для этого шорта
      const { data: existingLong } = await supabaseClient
        .from('trading_orders_2025_11_06_12_23')
        .select('*')
        .eq('user_id', userId)
        .eq('exchange', exchange)
        .eq('symbol', symbol)
        .eq('side', 'buy')
        .gte('created_at', lastShortOrder.created_at)
        .limit(1);

      if (!existingLong || existingLong.length === 0) {
        // Размещаем лонг ордер
        const settings = await supabaseClient
          .from('trading_settings_2025_11_06_12_23')
          .select('*')
          .eq('user_id', userId)
          .eq('exchange', exchange)
          .single();

        if (settings.data) {
          await placeLongAfterTP(supabaseClient, userId, exchange, symbol, settings.data);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking TP and placing long:', error);
    return false;
  }
}

// Функция размещения лонг ордера после TP
async function placeLongAfterTP(supabaseClient: any, userId: string, exchange: string, symbol: string, settings: any) {
  try {
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

    // Расчет количества для лонг позиции
    const notionalValue = settings.order_amount_usd * settings.leverage;
    const quantity = (notionalValue / currentPrice).toFixed(6);
    
    // Размещение лонг ордера
    const longOrderResult = await bybitRequest('/v5/order/create', {
      category: 'linear',
      symbol,
      side: 'Buy',
      orderType: 'Market',
      qty: quantity,
      timeInForce: 'IOC'
    }, 'POST');

    if (longOrderResult.retCode !== 0) {
      throw new Error(`Failed to place long order: ${longOrderResult.retMsg}`);
    }

    // Расчет цен для TP и SL лонг позиции
    const longTakeProfitPrice = (currentPrice * (1 + settings.long_tp_offset_percent / 100)).toFixed(2);
    const longStopLossPrice = (currentPrice * (1 - settings.stop_loss_percent / 100)).toFixed(2);

    // Размещение Take Profit ордера для лонга
    await bybitRequest('/v5/order/create', {
      category: 'linear',
      symbol,
      side: 'Sell',
      orderType: 'Limit',
      qty: quantity,
      price: longTakeProfitPrice,
      timeInForce: 'GTC',
      reduceOnly: true
    }, 'POST');

    // Размещение Stop Loss ордера для лонга
    await bybitRequest('/v5/order/create', {
      category: 'linear',
      symbol,
      side: 'Sell',
      orderType: 'StopMarket',
      qty: quantity,
      stopPrice: longStopLossPrice,
      timeInForce: 'GTC',
      reduceOnly: true
    }, 'POST');

    // Сохранение лонг ордера в базу данных
    await supabaseClient
      .from('trading_orders_2025_11_06_12_23')
      .insert({
        user_id: userId,
        exchange,
        symbol,
        order_id: longOrderResult.result.orderId,
        side: 'buy',
        order_type: 'market',
        quantity: parseFloat(quantity),
        price: currentPrice,
        amount_usd: settings.order_amount_usd,
        status: 'filled',
        created_at: new Date()
      });

    // Отправка уведомления
    await sendTelegramNotification(
      `🚀 <b>Лонг ордер после TP!</b>\n\n` +
      `📊 Биржа: ${exchange.toUpperCase()}\n` +
      `💰 Пара: ${symbol}\n` +
      `📈 Лонг по цене: $${currentPrice}\n` +
      `💵 Сумма: $${settings.order_amount_usd}\n` +
      `⚡ Плечо: ${settings.leverage}x\n` +
      `🎯 Take Profit: $${longTakeProfitPrice}\n` +
      `🛑 Stop Loss: $${longStopLossPrice}\n` +
      `⏰ Время: ${new Date().toISOString()}`
    );

    return longOrderResult;
  } catch (error) {
    console.error('Error placing long after TP:', error);
    throw error;
  }
}

// Функция выполнения почасовой торговли
async function executeHourlyTrade(supabaseClient: any, userId: string, exchange: string, symbol: string) {
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

    // Сначала проверяем TP и размещаем лонг если нужно
    await checkTPAndPlaceLong(supabaseClient, userId, exchange, symbol);

    // Ждем задержку
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

    // Расчет количества для шорт позиции с учетом плеча
    const notionalValue = settings.order_amount_usd * settings.leverage;
    const quantity = (notionalValue / currentPrice).toFixed(6);
    
    // Размещение шорт ордера
    const shortOrderResult = await bybitRequest('/v5/order/create', {
      category: 'linear',
      symbol,
      side: 'Sell',
      orderType: 'Market',
      qty: quantity,
      timeInForce: 'IOC'
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
        order_type: 'market',
        quantity: parseFloat(quantity),
        price: currentPrice,
        amount_usd: settings.order_amount_usd,
        status: 'filled',
        take_profit_order_id: tpOrderResult.retCode === 0 ? tpOrderResult.result.orderId : null,
        stop_loss_order_id: slOrderResult.retCode === 0 ? slOrderResult.result.orderId : null,
        funding_time: new Date()
      });

    // Отправка уведомления
    // Создаем ссылку на биржу
    const exchangeUrl = exchange.toLowerCase() === 'bybit' 
      ? `https://www.bybit.com/trade/usdt/${symbol}`
      : `https://www.binance.com/en/futures/${symbol}`;
    
    await sendTelegramNotification(
      `💰 <b>Почасовой трейд выполнен!</b>\n\n` +
      `📊 Биржа: ${exchange.toUpperCase()}\n` +
      `💰 Пара: <a href="${exchangeUrl}">${symbol}</a>\n` +
      `📉 Шорт по цене: $${currentPrice}\n` +
      `💵 Сумма: $${settings.order_amount_usd}\n` +
      `⚡ Плечо: ${settings.leverage}x\n` +
      `📊 Нотационная стоимость: $${notionalValue}\n` +
      `🎯 Take Profit: $${takeProfitPrice}\n` +
      `🛑 Stop Loss: $${stopLossPrice}\n` +
      `⏰ Время: ${new Date(new Date().getTime() + 2 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19)} (UTC+2)`
    );

    // Логирование
    await supabaseClient
      .from('trading_logs_2025_11_06_12_23')
      .insert({
        user_id: userId,
        exchange,
        action: 'hourly_trade_executed',
        message: `Hourly trade executed for ${symbol} at ${currentPrice}`,
        data: {
          symbol,
          price: currentPrice,
          quantity,
          notionalValue,
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
      notionalValue,
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
        action: 'hourly_trade_error',
        message: `Hourly trade failed: ${error.message}`,
        level: 'error',
        data: { error: error.message }
      });

    await sendTelegramNotification(
      `❌ <b>Ошибка почасового трейда</b>\n\n` +
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

    const requestData: HourlyTradeRequest = await req.json();
    let result;

    switch (requestData.action) {
      case 'get_next_hour_time':
        const nextHour = getNextHourTime();
        const timeUntilNextHour = nextHour.getTime() - Date.now();
        
        result = {
          nextHourTime: nextHour.toISOString(),
          timeUntilNextHour,
          isHourlyTradingTime: isHourlyTradingTime(),
          currentTime: new Date().toISOString()
        };
        break;

      case 'execute_hourly_trade':
        if (!requestData.symbol) {
          throw new Error('Symbol is required for hourly trade');
        }
        
        result = await executeHourlyTrade(
          supabaseClient,
          user.id,
          requestData.exchange,
          requestData.symbol
        );
        break;

      case 'start_hourly_bot':
      case 'toggle_trading':
        // Обновляем настройки для включения автоторговли
        await supabaseClient
          .from('trading_settings_2025_11_06_12_23')
          .upsert({
            user_id: user.id,
            exchange: requestData.exchange,
            auto_trading_enabled: requestData.enabled !== undefined ? requestData.enabled : true,
            updated_at: new Date().toISOString()
          });

        result = { 
          message: requestData.enabled !== false ? 'Hourly bot started' : 'Hourly bot stopped', 
          enabled: requestData.enabled !== false 
        };
        
        // Конвертируем UTC в киевское время (UTC+2) с часовым поясом
        const nextFundingUTC = getNextHourTime();
        const nextFundingKiev = new Date(nextFundingUTC.getTime() + 2 * 60 * 60 * 1000); // +2 часа
        const kievTimeString = nextFundingKiev.toISOString().replace('T', ' ').substring(0, 19) + ' (UTC+2)';
        
        await sendTelegramNotification(
          requestData.enabled !== false 
            ? `🤖 <b>Почасовой бот запущен</b>\n\n📊 Биржа: ${requestData.exchange.toUpperCase()}\n⏰ Следующая торговля: ${kievTimeString}`
            : `🛑 <b>Почасовой бот остановлен</b>\n\n📊 Биржа: ${requestData.exchange.toUpperCase()}`
        );
        break;

      case 'stop_hourly_bot':
        // Обновляем настройки для отключения автоторговли
        await supabaseClient
          .from('trading_settings_2025_11_06_12_23')
          .update({
            auto_trading_enabled: false,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('exchange', requestData.exchange);

        result = { message: 'Hourly bot stopped', enabled: false };
        
        await sendTelegramNotification(
          `🛑 <b>Почасовой бот остановлен</b>\n\n` +
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
    console.error('Hourly bot error:', error);
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