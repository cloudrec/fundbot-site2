import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface TradingRequest {
  action: 'place_order' | 'cancel_orders' | 'close_positions' | 'get_balance' | 'get_positions' | 'test_order';
  exchange: 'bybit' | 'binance' | 'mexc' | 'gate' | 'kucoin';
  symbol?: string;
  side?: 'buy' | 'sell';
  amount?: number;
  leverage?: number;
  takeProfit?: number;
  stopLoss?: number;
  delayMs?: number;
  testMode?: boolean;
}

// Функция для создания подписи HMAC
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

// Binance API функции
async function binanceRequest(endpoint: string, params: any = {}, method: string = 'GET') {
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API credentials not found');
  }

  const timestamp = Date.now();
  params.timestamp = timestamp;
  
  const queryString = new URLSearchParams(params).toString();
  const signature = await createSignature(apiSecret, queryString);
  
  const baseUrl = 'https://fapi.binance.com';
  const url = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    method,
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/json'
    }
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

// Функция получения баланса
async function getBalance(exchange: string) {
  switch (exchange) {
    case 'bybit':
      return await bybitRequest('/v5/account/wallet-balance', { accountType: 'UNIFIED' });
    case 'binance':
      return await binanceRequest('/fapi/v2/balance');
    default:
      throw new Error(`Exchange ${exchange} not implemented yet`);
  }
}

// Функция получения позиций
async function getPositions(exchange: string, symbol?: string) {
  switch (exchange) {
    case 'bybit':
      const params = symbol ? { symbol, category: 'linear' } : { category: 'linear' };
      return await bybitRequest('/v5/position/list', params);
    case 'binance':
      const binanceParams = symbol ? { symbol } : {};
      return await binanceRequest('/fapi/v2/positionRisk', binanceParams);
    default:
      throw new Error(`Exchange ${exchange} not implemented yet`);
  }
}

// Функция размещения ордера
async function placeOrder(exchange: string, symbol: string, side: string, amount: number, leverage: number, takeProfit?: number, stopLoss?: number) {
  let result;
  
  switch (exchange) {
    case 'bybit':
      // Установка кредитного плеча
      await bybitRequest('/v5/position/set-leverage', {
        category: 'linear',
        symbol,
        buyLeverage: leverage.toString(),
        sellLeverage: leverage.toString()
      }, 'POST');
      
      // Получение текущей цены
      const tickerResponse = await bybitRequest('/v5/market/tickers', { category: 'linear', symbol });
      const currentPrice = parseFloat(tickerResponse.result.list[0].lastPrice);
      
      // Расчет количества
      const quantity = (amount / currentPrice).toFixed(6);
      
      // Размещение основного ордера
      const orderParams = {
        category: 'linear',
        symbol,
        side: side === 'sell' ? 'Sell' : 'Buy',
        orderType: 'Limit',
        qty: quantity,
        price: currentPrice.toString(),
        timeInForce: 'GTC'
      };
      
      result = await bybitRequest('/v5/order/create', orderParams, 'POST');
      
      // Размещение TP/SL ордеров если указаны
      if (result.retCode === 0 && (takeProfit || stopLoss)) {
        const tpPrice = side === 'sell' 
          ? (currentPrice * (1 - takeProfit! / 100)).toFixed(2)
          : (currentPrice * (1 + takeProfit! / 100)).toFixed(2);
          
        const slPrice = side === 'sell'
          ? (currentPrice * (1 + stopLoss! / 100)).toFixed(2)
          : (currentPrice * (1 - stopLoss! / 100)).toFixed(2);
        
        if (takeProfit) {
          await bybitRequest('/v5/order/create', {
            category: 'linear',
            symbol,
            side: side === 'sell' ? 'Buy' : 'Sell',
            orderType: 'Limit',
            qty: quantity,
            price: tpPrice,
            timeInForce: 'GTC',
            reduceOnly: true
          }, 'POST');
        }
        
        if (stopLoss) {
          await bybitRequest('/v5/order/create', {
            category: 'linear',
            symbol,
            side: side === 'sell' ? 'Buy' : 'Sell',
            orderType: 'StopMarket',
            qty: quantity,
            stopPrice: slPrice,
            timeInForce: 'GTC',
            reduceOnly: true
          }, 'POST');
        }
      }
      break;
      
    case 'binance':
      // Установка кредитного плеча
      await binanceRequest('/fapi/v1/leverage', { symbol, leverage }, 'POST');
      
      // Получение текущей цены
      const binanceTickerResponse = await binanceRequest('/fapi/v1/ticker/price', { symbol });
      const binanceCurrentPrice = parseFloat(binanceTickerResponse.price);
      
      // Расчет количества
      const binanceQuantity = (amount / binanceCurrentPrice).toFixed(6);
      
      // Размещение основного ордера
      result = await binanceRequest('/fapi/v1/order', {
        symbol,
        side: side.toUpperCase(),
        type: 'LIMIT',
        quantity: binanceQuantity,
        price: binanceCurrentPrice.toString(),
        timeInForce: 'GTC'
      }, 'POST');
      break;
      
    default:
      throw new Error(`Exchange ${exchange} not implemented yet`);
  }
  
  return result;
}

// Функция отмены всех ордеров
async function cancelAllOrders(exchange: string, symbol?: string) {
  switch (exchange) {
    case 'bybit':
      const params = symbol 
        ? { category: 'linear', symbol }
        : { category: 'linear' };
      return await bybitRequest('/v5/order/cancel-all', params, 'POST');
    case 'binance':
      const binanceParams = symbol ? { symbol } : {};
      return await binanceRequest('/fapi/v1/allOpenOrders', binanceParams, 'DELETE');
    default:
      throw new Error(`Exchange ${exchange} not implemented yet`);
  }
}

// Функция закрытия всех позиций
async function closeAllPositions(exchange: string, symbol?: string) {
  const positions = await getPositions(exchange, symbol);
  const results = [];
  
  switch (exchange) {
    case 'bybit':
      for (const position of positions.result.list) {
        if (parseFloat(position.size) > 0) {
          const result = await bybitRequest('/v5/order/create', {
            category: 'linear',
            symbol: position.symbol,
            side: position.side === 'Buy' ? 'Sell' : 'Buy',
            orderType: 'Market',
            qty: position.size,
            reduceOnly: true
          }, 'POST');
          results.push(result);
        }
      }
      break;
    case 'binance':
      for (const position of positions) {
        if (parseFloat(position.positionAmt) !== 0) {
          const side = parseFloat(position.positionAmt) > 0 ? 'SELL' : 'BUY';
          const quantity = Math.abs(parseFloat(position.positionAmt)).toString();
          
          const result = await binanceRequest('/fapi/v1/order', {
            symbol: position.symbol,
            side,
            type: 'MARKET',
            quantity,
            reduceOnly: true
          }, 'POST');
          results.push(result);
        }
      }
      break;
    default:
      throw new Error(`Exchange ${exchange} not implemented yet`);
  }
  
  return results;
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

    const requestData: TradingRequest = await req.json();
    let result;

    // Логирование действия
    await supabaseClient
      .from('trading_logs_2025_11_06_12_23')
      .insert({
        user_id: user.id,
        exchange: requestData.exchange,
        action: requestData.action,
        message: `Executing ${requestData.action} on ${requestData.exchange}`,
        data: requestData
      });

    // Задержка если указана
    if (requestData.delayMs && requestData.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, requestData.delayMs));
    }

    switch (requestData.action) {
      case 'get_balance':
        result = await getBalance(requestData.exchange);
        break;
        
      case 'get_positions':
        result = await getPositions(requestData.exchange, requestData.symbol);
        break;
        
      case 'place_order':
      case 'test_order':
        if (!requestData.symbol || !requestData.side || !requestData.amount) {
          throw new Error('Missing required parameters for order placement');
        }
        
        if (!requestData.testMode) {
          result = await placeOrder(
            requestData.exchange,
            requestData.symbol,
            requestData.side,
            requestData.amount,
            requestData.leverage || 10,
            requestData.takeProfit,
            requestData.stopLoss
          );
          
          // Сохранение ордера в базу данных
          await supabaseClient
            .from('trading_orders_2025_11_06_12_23')
            .insert({
              user_id: user.id,
              exchange: requestData.exchange,
              symbol: requestData.symbol,
              order_id: result.result?.orderId || result.orderId || 'unknown',
              side: requestData.side,
              order_type: 'limit',
              quantity: requestData.amount,
              amount_usd: requestData.amount,
              status: 'pending'
            });
          
          // Отправка уведомления в Telegram
          await sendTelegramNotification(
            `🔄 <b>Новый ордер размещен</b>\n` +
            `📊 Биржа: ${requestData.exchange.toUpperCase()}\n` +
            `💰 Пара: ${requestData.symbol}\n` +
            `📈 Сторона: ${requestData.side.toUpperCase()}\n` +
            `💵 Сумма: $${requestData.amount}\n` +
            `⚡ Плечо: ${requestData.leverage}x`
          );
        } else {
          result = { message: 'Test order - no actual order placed', testMode: true };
        }
        break;
        
      case 'cancel_orders':
        result = await cancelAllOrders(requestData.exchange, requestData.symbol);
        await sendTelegramNotification(
          `❌ <b>Ордера отменены</b>\n` +
          `📊 Биржа: ${requestData.exchange.toUpperCase()}\n` +
          `💰 Пара: ${requestData.symbol || 'Все'}`
        );
        break;
        
      case 'close_positions':
        result = await closeAllPositions(requestData.exchange, requestData.symbol);
        await sendTelegramNotification(
          `🔒 <b>Позиции закрыты</b>\n` +
          `📊 Биржа: ${requestData.exchange.toUpperCase()}\n` +
          `💰 Пара: ${requestData.symbol || 'Все'}`
        );
        break;
        
      default:
        throw new Error(`Unknown action: ${requestData.action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Trading operation error:', error);
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