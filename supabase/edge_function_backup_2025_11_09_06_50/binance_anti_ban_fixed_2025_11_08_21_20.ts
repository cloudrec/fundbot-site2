import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface TradingRequest {
  action: string;
  user_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🟡 BINANCE FIXED: Request received');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🟡 BINANCE FIXED Request:', { action: requestBody.action, user_id: requestBody.user_id });
    
    const { action, user_id }: TradingRequest = requestBody;
    
    if (!user_id) {
      throw new Error('user_id is required');
    }

    let result;

    // Специальная обработка для scan_funding (без rate limit)
    if (action === 'scan_funding') {
      result = await scanFunding();
    } else {
      // Получаем настройки пользователя из базы данных
      const { data: settings, error: settingsError } = await supabase
        .from('trading_settings')
        .select('*')
        .eq('user_id', user_id)
        .single();

      if (settingsError || !settings) {
        throw new Error(`Настройки пользователя не найдены: ${settingsError?.message}`);
      }

      console.log('🟡 BINANCE FIXED: User settings loaded:', { 
        exchange: settings.exchange, 
        base_asset: settings.base_asset,
        quote_asset: settings.quote_asset,
        order_amount_usd: settings.order_amount_usd
      });

      // Выполняем действие
      switch (action) {
        case 'get_balance':
          result = await getBalance();
          break;
        case 'place_order_with_tp_sl':
          result = await placeOrderWithTPSL(settings);
          break;
        case 'close_positions':
          result = await closePositions(settings);
          break;
        case 'cancel_orders':
          result = await cancelAllOrders(settings);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('🟡 BINANCE FIXED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// 🔐 HMAC SHA256 подпись для Binance
async function createSignature(queryString: string, secret: string): Promise<string> {
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
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 💰 ПОЛУЧЕНИЕ БАЛАНСА
async function getBalance() {
  console.log('🟡 BINANCE FIXED: Getting balance...');
  
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API keys not configured');
  }

  const baseUrl = 'https://fapi.binance.com';
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await createSignature(queryString, apiSecret);

  const response = await fetch(`${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`, {
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Binance balance error: ${response.status}`);
  }

  const balances = await response.json();
  const usdtBalance = balances.find((b: any) => b.asset === 'USDT');
  
  return {
    available_balance: usdtBalance?.availableBalance || '0',
    currency: 'USDT',
    status: 'LIVE ✅',
    exchange: 'BINANCE'
  };
}

// 📈 РАЗМЕЩЕНИЕ ОРДЕРА С TP/SL
async function placeOrderWithTPSL(settings: any) {
  console.log('🟡 BINANCE FIXED: Placing order with TP/SL...');
  
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API keys not configured');
  }

  const baseUrl = 'https://fapi.binance.com';
  const symbol = `${settings.base_asset}${settings.quote_asset}`;
  
  // 🚫 ANTI-BAN: Получаем цену с защитой от блокировки
  const { currentPrice, quantity } = await getCurrentPriceWithFallback(symbol, settings, baseUrl);
  
  // Рассчитываем TP/SL цены
  const tpPrice = (currentPrice * 1.01).toFixed(4); // +1% для TP
  const slPrice = (currentPrice * 0.99).toFixed(4); // -1% для SL
  
  console.log('🟡 BINANCE FIXED: TP/SL prices:', { tpPrice, slPrice });

  // 1. Размещаем основной market ордер
  const timestamp1 = Date.now();
  const orderParams1 = {
    symbol: symbol,
    side: 'BUY',
    type: 'MARKET',
    quantity: quantity.toString(),
    timestamp: timestamp1
  };
  
  const queryString1 = new URLSearchParams(orderParams1).toString();
  const signature1 = await createSignature(queryString1, apiSecret);

  const mainOrderResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `${queryString1}&signature=${signature1}`
  });

  if (!mainOrderResponse.ok) {
    const errorText = await mainOrderResponse.text();
    throw new Error(`Binance main order error: ${mainOrderResponse.status} ${errorText}`);
  }

  const mainOrder = await mainOrderResponse.json();
  console.log('🟡 BINANCE FIXED: Main order placed:', mainOrder.orderId);

  // 🚫 ANTI-BAN: Задержка между запросами
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 2. Размещаем Take Profit ордер
  const timestamp2 = Date.now();
  const tpParams = {
    symbol: symbol,
    side: 'SELL',
    type: 'TAKE_PROFIT_MARKET',
    quantity: quantity.toString(),
    stopPrice: tpPrice,
    reduceOnly: 'true',
    timestamp: timestamp2
  };
  
  const queryString2 = new URLSearchParams(tpParams).toString();
  const signature2 = await createSignature(queryString2, apiSecret);

  const tpOrderResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `${queryString2}&signature=${signature2}`
  });

  let tpOrder = null;
  if (tpOrderResponse.ok) {
    tpOrder = await tpOrderResponse.json();
    console.log('🟡 BINANCE FIXED: TP order placed:', tpOrder.orderId);
  }

  // 🚫 ANTI-BAN: Задержка между запросами
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 3. Размещаем Stop Loss ордер
  const timestamp3 = Date.now();
  const slParams = {
    symbol: symbol,
    side: 'SELL',
    type: 'STOP_MARKET',
    quantity: quantity.toString(),
    stopPrice: slPrice,
    reduceOnly: 'true',
    timestamp: timestamp3
  };
  
  const queryString3 = new URLSearchParams(slParams).toString();
  const signature3 = await createSignature(queryString3, apiSecret);

  const slOrderResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `${queryString3}&signature=${signature3}`
  });

  let slOrder = null;
  if (slOrderResponse.ok) {
    slOrder = await slOrderResponse.json();
    console.log('🟡 BINANCE FIXED: SL order placed:', slOrder.orderId);
  }

  return {
    order_id: mainOrder.orderId,
    symbol: symbol,
    side: 'BUY',
    status: 'LIVE',
    message: `РЕАЛЬНЫЙ BINANCE FIXED ордер с TP/SL: ${mainOrder.orderId}`,
    quantity: quantity.toString(),
    price: currentPrice,
    tp_price: tpPrice,
    sl_price: slPrice,
    tp_order_id: tpOrder?.orderId,
    sl_order_id: slOrder?.orderId,
    exchange: 'BINANCE',
    note: 'РЕАЛЬНЫЙ BINANCE ОРДЕР С ANTI-BAN! ⚡',
    api_response: {
      main_order: mainOrder,
      tp_order: tpOrder,
      sl_order: slOrder
    }
  };
}

// 🚫 ANTI-BAN: Получение цены с fallback
async function getCurrentPriceWithFallback(symbol: string, settings: any, baseUrl: string) {
  console.log('🟡 BINANCE FIXED: Getting current price for:', symbol);
  
  // 🚫 ANTI-BAN: Добавляем задержку и заголовки
  await new Promise(resolve => setTimeout(resolve, 500)); // 500ms задержка
  
  const priceResponse = await fetch(`${baseUrl}/fapi/v1/ticker/price?symbol=${symbol}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
  
  if (!priceResponse.ok) {
    // 🚫 FALLBACK: Пробуем альтернативный эндпоинт
    console.log('🚫 BINANCE: Основной эндпоинт заблокирован, пробуем 24hr ticker...');
    
    const fallbackResponse = await fetch(`${baseUrl}/fapi/v1/ticker/24hr?symbol=${symbol}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    
    if (!fallbackResponse.ok) {
      throw new Error(`Не удалось получить цену для ${symbol}: ${priceResponse.status} (fallback: ${fallbackResponse.status})`);
    }
    
    const fallbackData = await fallbackResponse.json();
    const currentPrice = parseFloat(fallbackData.lastPrice);
    console.log('🚫 BINANCE: Используем fallback цену:', currentPrice);
    
    const quantity = Math.floor(settings.order_amount_usd / currentPrice);
    return { currentPrice, quantity };
  }
  
  // Основной путь - получаем цену из основного эндпоинта
  const priceData = await priceResponse.json();
  const currentPrice = parseFloat(priceData.price);
  const quantity = Math.floor(settings.order_amount_usd / currentPrice);
  
  console.log('🟡 BINANCE FIXED: Current price:', currentPrice, 'Quantity:', quantity);
  
  return { currentPrice, quantity };
}

// 🔴 ЗАКРЫТИЕ ПОЗИЦИЙ
async function closePositions(settings: any) {
  console.log('🟡 BINANCE FIXED: Closing positions...');
  
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API keys not configured');
  }

  const baseUrl = 'https://fapi.binance.com';
  const symbol = `${settings.base_asset}${settings.quote_asset}`;
  
  // Получаем открытые позиции
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await createSignature(queryString, apiSecret);

  const positionsResponse = await fetch(`${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!positionsResponse.ok) {
    throw new Error(`Binance positions error: ${positionsResponse.status}`);
  }

  const positions = await positionsResponse.json();
  const openPositions = positions.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
  
  if (openPositions.length === 0) {
    return {
      message: 'BINANCE FIXED: Нет открытых позиций для закрытия',
      closed_positions: 0,
      total_positions_found: 0,
      exchange: 'BINANCE'
    };
  }

  const closeResults = [];
  
  for (const position of openPositions) {
    try {
      const positionSize = Math.abs(parseFloat(position.positionAmt));
      const side = parseFloat(position.positionAmt) > 0 ? 'SELL' : 'BUY';
      
      const closeTimestamp = Date.now();
      const closeParams = {
        symbol: position.symbol,
        side: side,
        type: 'MARKET',
        quantity: positionSize.toString(),
        reduceOnly: 'true',
        timestamp: closeTimestamp
      };
      
      const closeQueryString = new URLSearchParams(closeParams).toString();
      const closeSignature = await createSignature(closeQueryString, apiSecret);

      const closeResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${closeQueryString}&signature=${closeSignature}`
      });

      if (closeResponse.ok) {
        const closeResult = await closeResponse.json();
        closeResults.push({
          symbol: position.symbol,
          order_id: closeResult.orderId,
          status: 'SUCCESS',
          original_size: positionSize,
          close_side: side,
          close_quantity: positionSize.toString()
        });
      } else {
        closeResults.push({
          symbol: position.symbol,
          status: 'FAILED',
          error: await closeResponse.text()
        });
      }
      
      // 🚫 ANTI-BAN: Задержка между закрытиями
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      closeResults.push({
        symbol: position.symbol,
        status: 'ERROR',
        error: error.message
      });
    }
  }

  const successfulCloses = closeResults.filter(r => r.status === 'SUCCESS').length;
  
  return {
    message: `BINANCE FIXED: Закрытие позиций: ${successfulCloses}/${openPositions.length} успешно`,
    closed_positions: successfulCloses,
    total_positions_found: openPositions.length,
    close_results: closeResults,
    exchange: 'BINANCE',
    status: 'LIVE'
  };
}

// ❌ ОТМЕНА ВСЕХ ОРДЕРОВ
async function cancelAllOrders(settings: any) {
  console.log('🟡 BINANCE FIXED: Cancelling all orders...');
  
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API keys not configured');
  }

  const baseUrl = 'https://fapi.binance.com';
  const symbol = `${settings.base_asset}${settings.quote_asset}`;
  
  const timestamp = Date.now();
  const cancelParams = {
    symbol: symbol,
    timestamp: timestamp
  };
  
  const queryString = new URLSearchParams(cancelParams).toString();
  const signature = await createSignature(queryString, apiSecret);

  const response = await fetch(`${baseUrl}/fapi/v1/allOpenOrders`, {
    method: 'DELETE',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `${queryString}&signature=${signature}`
  });

  if (!response.ok) {
    throw new Error(`Binance cancel orders error: ${response.status}`);
  }

  const result = await response.json();
  
  return {
    message: `BINANCE FIXED: Отменено ордеров: ${result.length}`,
    cancelled_orders: result.length,
    exchange: 'BINANCE'
  };
}

// 📊 СКАНИРОВАНИЕ ФАНДИНГА
async function scanFunding() {
  console.log('🟡 BINANCE FIXED: Scanning funding rates...');
  
  const response = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
  
  if (!response.ok) {
    throw new Error(`Binance funding scan error: ${response.status}`);
  }

  const data = await response.json();
  
  // Находим лучший фандинг
  const bestFunding = data
    .filter((item: any) => parseFloat(item.lastFundingRate) > 0)
    .sort((a: any, b: any) => parseFloat(b.lastFundingRate) - parseFloat(a.lastFundingRate))[0];

  if (!bestFunding) {
    return {
      exchange: 'BINANCE',
      message: 'Нет положительных фандингов',
      scan_time: new Date().toISOString()
    };
  }

  return {
    exchange: 'BINANCE',
    best_funding: {
      symbol: bestFunding.symbol,
      funding_rate: parseFloat(bestFunding.lastFundingRate),
      next_funding_time: new Date(parseInt(bestFunding.nextFundingTime)).toISOString(),
      funding_direction: parseFloat(bestFunding.lastFundingRate) > 0 ? 'LONG pays SHORT' : 'SHORT pays LONG'
    },
    scan_time: new Date().toISOString()
  };
}