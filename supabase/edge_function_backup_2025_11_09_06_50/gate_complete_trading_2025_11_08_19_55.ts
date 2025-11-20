import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, user_id, ...params } = await req.json();
    
    console.log('🟢 GATE.IO ACTION:', action, 'for user:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем настройки пользователя
    const { data: settings } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (!settings) {
      throw new Error('Настройки пользователя не найдены');
    }

    // Получаем API ключи Gate.io
    const gateApiKey = Deno.env.get('GATE_API_KEY');
    const gateApiSecret = Deno.env.get('GATE_API_SECRET');

    if (!gateApiKey || !gateApiSecret) {
      // 🚫 ДЛЯ ТЕСТИРОВАНИЯ: возвращаем тестовые данные
      console.log('🚫 GATE.IO: API ключи не настроены, возвращаем тестовые данные');
      
      if (action === 'get_balance') {
        return new Response(
          JSON.stringify({ 
            success: true, 
            data: {
              available_balance: '1000.00',
              currency: 'USDT',
              status: 'TEST MODE 🚨',
              exchange: 'GATE.IO',
              note: 'Тестовые данные - добавьте API ключи!'
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('Gate.io API ключи не настроены. Добавьте GATE_API_KEY и GATE_API_SECRET в Supabase secrets.');
    }

    let result;

    switch (action) {
      case 'get_balance':
        result = await getGateBalance(gateApiKey, gateApiSecret);
        break;
      
      case 'place_order_with_tp_sl':
        result = await placeGateOrderWithTPSL(gateApiKey, gateApiSecret, settings);
        break;
      
      case 'close_positions':
        result = await closeGatePositions(gateApiKey, gateApiSecret, settings);
        break;
      
      case 'cancel_orders':
        result = await cancelGateOrders(gateApiKey, gateApiSecret, settings);
        break;
      
      case 'scan_funding':
        result = await scanGateFunding(gateApiKey, gateApiSecret);
        break;
      
      default:
        throw new Error(`Неизвестное действие: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE.IO Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// 🔐 GATE.IO API SIGNATURE
function generateGateSignature(method: string, url: string, queryString: string, body: string, timestamp: string, apiSecret: string) {
  const message = `${method}\n${url}\n${queryString}\n${body}\n${timestamp}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(message);
  
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  ).then(key => 
    crypto.subtle.sign('HMAC', key, messageData)
  ).then(signature => 
    Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

// 💰 ПОЛУЧЕНИЕ БАЛАНСА
async function getGateBalance(apiKey: string, apiSecret: string) {
  console.log('💰 Getting Gate.io balance...');
  
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = 'GET';
  const url = '/api/v4/futures/usdt/accounts';
  const queryString = '';
  const body = '';

  const signature = await generateGateSignature(method, url, queryString, body, timestamp, apiSecret);

  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: {
      'KEY': apiKey,
      'Timestamp': timestamp,
      'SIGN': signature,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gate.io balance error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  
  return {
    available_balance: data.available || '0',
    currency: 'USDT',
    status: 'LIVE ✅',
    exchange: 'GATE.IO'
  };
}

// 📈 РАЗМЕЩЕНИЕ ОРДЕРА С TP/SL (Price Triggered Orders)
async function placeGateOrderWithTPSL(apiKey: string, apiSecret: string, settings: any) {
  console.log('📈 Placing Gate.io order with TP/SL...');
  
  const symbol = `${settings.base_asset}_${settings.quote_asset}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  // Получаем текущую цену
  const priceResponse = await fetch(`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${symbol}`);
  const priceData = await priceResponse.json();
  
  if (!priceData || priceData.length === 0) {
    throw new Error(`Не удалось получить цену для ${symbol}`);
  }
  
  const currentPrice = parseFloat(priceData[0].last);
  const orderSize = Math.floor(settings.order_amount_usd / currentPrice);
  
  // Рассчитываем TP/SL цены
  const tpPrice = (currentPrice * (1 + settings.long_tp_offset_percent / 100)).toFixed(4);
  const slPrice = (currentPrice * (1 - settings.long_stop_loss_percent / 100)).toFixed(4);
  
  const orderData = {
    contract: symbol,
    size: orderSize.toString(),
    side: 'buy',
    price: '0', // Market order
    tif: 'ioc',
    // Price Triggered Orders для TP/SL
    auto_size: 'close_long',
    take_profit_trigger: tpPrice,
    take_profit: '0', // Market order при срабатывании
    stop_loss_trigger: slPrice,
    stop_loss: '0' // Market order при срабатывании
  };

  const method = 'POST';
  const url = '/api/v4/futures/usdt/price_orders';
  const body = JSON.stringify(orderData);
  const queryString = '';

  const signature = await generateGateSignature(method, url, queryString, body, timestamp, apiSecret);

  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: {
      'KEY': apiKey,
      'Timestamp': timestamp,
      'SIGN': signature,
      'Content-Type': 'application/json'
    },
    body: body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gate.io order error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  
  return {
    order_id: result.id,
    symbol: symbol,
    side: 'BUY',
    status: 'LIVE',
    message: `GATE.IO ордер с TP/SL: ${result.id}`,
    quantity: orderSize.toString(),
    price: currentPrice,
    tp_price: tpPrice,
    sl_price: slPrice,
    exchange: 'GATE.IO',
    note: 'РЕАЛЬНЫЙ GATE.IO ОРДЕР С PRICE TRIGGERED ORDERS! ⚡',
    api_response: result
  };
}

// 🔴 ЗАКРЫТИЕ ПОЗИЦИЙ
async function closeGatePositions(apiKey: string, apiSecret: string, settings: any) {
  console.log('🔴 Closing Gate.io positions...');
  
  const symbol = `${settings.base_asset}_${settings.quote_asset}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  // Получаем открытые позиции
  const method = 'GET';
  const url = '/api/v4/futures/usdt/positions';
  const queryString = '';
  const body = '';

  const signature = await generateGateSignature(method, url, queryString, body, timestamp, apiSecret);

  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: {
      'KEY': apiKey,
      'Timestamp': timestamp,
      'SIGN': signature,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gate.io positions error: ${response.status} ${errorText}`);
  }

  const positions = await response.json();
  const openPositions = positions.filter((pos: any) => parseFloat(pos.size) !== 0);
  
  if (openPositions.length === 0) {
    return {
      message: 'GATE.IO: Нет открытых позиций для закрытия',
      closed_positions: 0,
      total_positions_found: 0,
      exchange: 'GATE.IO'
    };
  }

  const closeResults = [];
  
  for (const position of openPositions) {
    try {
      // Закрываем позицию market ордером
      const closeOrderData = {
        contract: position.contract,
        size: Math.abs(parseFloat(position.size)).toString(),
        side: parseFloat(position.size) > 0 ? 'sell' : 'buy',
        price: '0', // Market order
        tif: 'ioc',
        reduce_only: true
      };

      const closeTimestamp = Math.floor(Date.now() / 1000).toString();
      const closeMethod = 'POST';
      const closeUrl = '/api/v4/futures/usdt/orders';
      const closeBody = JSON.stringify(closeOrderData);
      
      const closeSignature = await generateGateSignature(closeMethod, closeUrl, '', closeBody, closeTimestamp, apiSecret);

      const closeResponse = await fetch(`https://api.gateio.ws${closeUrl}`, {
        method: closeMethod,
        headers: {
          'KEY': apiKey,
          'Timestamp': closeTimestamp,
          'SIGN': closeSignature,
          'Content-Type': 'application/json'
        },
        body: closeBody
      });

      if (closeResponse.ok) {
        const closeResult = await closeResponse.json();
        closeResults.push({
          symbol: position.contract,
          order_id: closeResult.id,
          status: 'SUCCESS',
          original_size: parseFloat(position.size),
          close_side: parseFloat(position.size) > 0 ? 'Sell' : 'Buy'
        });
      } else {
        closeResults.push({
          symbol: position.contract,
          status: 'FAILED',
          error: await closeResponse.text()
        });
      }
    } catch (error) {
      closeResults.push({
        symbol: position.contract,
        status: 'ERROR',
        error: error.message
      });
    }
  }

  const successfulCloses = closeResults.filter(r => r.status === 'SUCCESS').length;
  
  return {
    message: `GATE.IO: Закрытие позиций: ${successfulCloses}/${openPositions.length} успешно`,
    closed_positions: successfulCloses,
    total_positions_found: openPositions.length,
    close_results: closeResults,
    exchange: 'GATE.IO',
    status: 'LIVE'
  };
}

// ❌ ОТМЕНА ОРДЕРОВ
async function cancelGateOrders(apiKey: string, apiSecret: string, settings: any) {
  console.log('❌ Cancelling Gate.io orders...');
  
  const symbol = `${settings.base_asset}_${settings.quote_asset}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  // Получаем открытые ордера
  const method = 'GET';
  const url = `/api/v4/futures/usdt/orders?contract=${symbol}&status=open`;
  const queryString = `contract=${symbol}&status=open`;
  const body = '';

  const signature = await generateGateSignature(method, url, queryString, body, timestamp, apiSecret);

  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: {
      'KEY': apiKey,
      'Timestamp': timestamp,
      'SIGN': signature,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gate.io orders error: ${response.status} ${errorText}`);
  }

  const orders = await response.json();
  
  if (orders.length === 0) {
    return {
      message: 'GATE.IO: Нет открытых ордеров для отмены',
      cancelled_orders: 0,
      total_orders_found: 0,
      exchange: 'GATE.IO'
    };
  }

  let cancelledCount = 0;
  
  for (const order of orders) {
    try {
      const cancelTimestamp = Math.floor(Date.now() / 1000).toString();
      const cancelMethod = 'DELETE';
      const cancelUrl = `/api/v4/futures/usdt/orders/${order.id}`;
      
      const cancelSignature = await generateGateSignature(cancelMethod, cancelUrl, '', '', cancelTimestamp, apiSecret);

      const cancelResponse = await fetch(`https://api.gateio.ws${cancelUrl}`, {
        method: cancelMethod,
        headers: {
          'KEY': apiKey,
          'Timestamp': cancelTimestamp,
          'SIGN': cancelSignature,
          'Content-Type': 'application/json'
        }
      });

      if (cancelResponse.ok) {
        cancelledCount++;
      }
    } catch (error) {
      console.error('Error cancelling order:', order.id, error.message);
    }
  }
  
  return {
    message: `GATE.IO: Отменено ордеров: ${cancelledCount}/${orders.length}`,
    cancelled_orders: cancelledCount,
    total_orders_found: orders.length,
    exchange: 'GATE.IO'
  };
}

// 📊 СКАНИРОВАНИЕ ФАНДИНГА
async function scanGateFunding(apiKey: string, apiSecret: string) {
  console.log('📊 Scanning Gate.io funding rates...');
  
  const response = await fetch('https://api.gateio.ws/api/v4/futures/usdt/tickers');
  
  if (!response.ok) {
    throw new Error(`Gate.io funding scan error: ${response.status}`);
  }

  const data = await response.json();
  
  // Фильтруем по фандингу > 0.5%
  const highFundingPairs = data
    .filter((ticker: any) => parseFloat(ticker.funding_rate || '0') > 0.005)
    .map((ticker: any) => ({
      symbol: ticker.contract,
      funding_rate: (parseFloat(ticker.funding_rate || '0') * 100).toFixed(3),
      next_funding_time: new Date(parseInt(ticker.funding_time || '0') * 1000).toISOString()
    }))
    .sort((a: any, b: any) => parseFloat(b.funding_rate) - parseFloat(a.funding_rate))
    .slice(0, 10);

  return {
    exchange: 'GATE.IO',
    total_pairs_scanned: data.length,
    high_funding_pairs: highFundingPairs,
    scan_time: new Date().toISOString()
  };
}