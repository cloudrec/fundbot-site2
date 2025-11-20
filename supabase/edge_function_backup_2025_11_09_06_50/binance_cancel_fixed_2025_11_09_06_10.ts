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
    const { action, user_id } = await req.json();
    
    console.log('🟡 BINANCE CANCEL FIXED: Starting action:', action);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем ТОЛЬКО Binance API ключи
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'binance')
      .single();

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ success: false, error: 'Binance API ключи не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Получаем настройки
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🟡 BINANCE CANCEL FIXED: Keys loaded, settings:', !!settings);

    // Обработка разных действий
    switch (action) {
      case 'get_balance':
        return await handleGetBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handlePlaceOrderWithTPSL(apiKeys, settings);
      
      case 'get_positions':
        return await handleGetPositions(apiKeys);
      
      case 'close_positions':
      case 'close_all_positions':
        return await handleClosePositions(apiKeys);
      
      case 'cancel_orders':
      case 'cancel_all_orders':
        return await handleCancelOrders(apiKeys);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ BINANCE CANCEL FIXED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Получение баланса ТОЛЬКО Binance
async function handleGetBalance(apiKeys: any) {
  console.log('🟡 BINANCE CANCEL FIXED: Getting balance');
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  
  const signature = await createSignature(queryString, apiKeys.api_secret);
  
  const url = `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKeys.api_key,
    },
  });

  const data = await response.json();

  if (response.ok) {
    const usdtBalance = data.assets?.find((asset: any) => asset.asset === 'USDT');
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          available_balance: usdtBalance?.availableBalance || '0.00',
          currency: 'USDT',
          status: 'LIVE ✅',
          exchange: 'BINANCE'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Binance API error: ${data.msg || 'Unknown error'}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций ТОЛЬКО Binance
async function handleGetPositions(apiKeys: any) {
  console.log('🟡 BINANCE CANCEL FIXED: Getting positions');
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  
  const signature = await createSignature(queryString, apiKeys.api_secret);
  
  const url = `https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKeys.api_key,
    },
  });

  const data = await response.json();

  if (response.ok) {
    const activePositions = data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
    
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          positions: activePositions.map((pos: any) => ({
            symbol: pos.symbol,
            size: pos.positionAmt,
            side: parseFloat(pos.positionAmt) > 0 ? 'Long' : 'Short',
            unrealizedPnl: pos.unRealizedProfit,
            markPrice: pos.markPrice,
            exchange: 'Binance'
          })),
          exchange: 'BINANCE'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Binance positions error: ${data.msg || 'Unknown error'}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Размещение ордера с TP/SL - ИСПРАВЛЕННАЯ ЛОГИКА
async function handlePlaceOrderWithTPSL(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE CANCEL FIXED: Placing order with TP/SL');
  
  if (!settings) {
    return new Response(
      JSON.stringify({ success: false, error: 'Настройки не найдены' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ФИКСИРОВАННЫЕ ПАРАМЕТРЫ ДЛЯ ТЕСТИРОВАНИЯ
  const symbol = 'BTCUSDT';
  const quantity = '0.001'; // Фиксированное количество
  
  try {
    // 1. Получаем информацию о символе для правильной точности
    const exchangeInfoResponse = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const exchangeInfo = await exchangeInfoResponse.json();
    
    const symbolInfo = exchangeInfo.symbols?.find((s: any) => s.symbol === symbol);
    const priceFilter = symbolInfo?.filters?.find((f: any) => f.filterType === 'PRICE_FILTER');
    const tickSize = parseFloat(priceFilter?.tickSize || '0.01');
    
    console.log('🟡 BINANCE CANCEL FIXED: Symbol info:', { symbol, tickSize });

    // 2. Получаем текущую цену
    const priceResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData.price);
    
    // 3. Рассчитываем TP/SL цены с правильной точностью
    const tpPriceRaw = currentPrice * 1.02; // +2%
    const slPriceRaw = currentPrice * 0.98; // -2%
    
    // Округляем до правильного tick size
    const tpPrice = (Math.round(tpPriceRaw / tickSize) * tickSize).toFixed(2);
    const slPrice = (Math.round(slPriceRaw / tickSize) * tickSize).toFixed(2);
    
    console.log('🟡 BINANCE CANCEL FIXED: Price calculation:', {
      currentPrice,
      tpPriceRaw,
      slPriceRaw,
      tpPrice,
      slPrice,
      tickSize
    });

    // 4. Размещаем основной ордер
    const mainOrderResult = await placeOrder(apiKeys, {
      symbol: symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: quantity
    });

    if (!mainOrderResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Main order failed: ${mainOrderResult.error}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Размещаем Take Profit ордер (ИСПРАВЛЕНО)
    const tpOrderResult = await placeOrder(apiKeys, {
      symbol: symbol,
      side: 'SELL',
      type: 'TAKE_PROFIT_MARKET',
      quantity: quantity,
      stopPrice: tpPrice,
      reduceOnly: 'true'
    });

    // 6. Размещаем Stop Loss ордер
    const slOrderResult = await placeOrder(apiKeys, {
      symbol: symbol,
      side: 'SELL',
      type: 'STOP_MARKET',
      quantity: quantity,
      stopPrice: slPrice,
      reduceOnly: 'true'
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: `Binance ордер с TP/SL размещен: ${symbol}`,
          order_id: mainOrderResult.data.orderId,
          tp_order_id: tpOrderResult.success ? tpOrderResult.data.orderId : null,
          sl_order_id: slOrderResult.success ? slOrderResult.data.orderId : null,
          symbol: symbol,
          quantity: quantity,
          current_price: currentPrice,
          tp_price: tpPrice,
          sl_price: slPrice,
          tick_size: tickSize,
          tp_error: tpOrderResult.success ? null : tpOrderResult.error,
          sl_error: slOrderResult.success ? null : slOrderResult.error,
          exchange: 'BINANCE'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Order placement error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Вспомогательная функция для размещения ордера
async function placeOrder(apiKeys: any, orderParams: any) {
  const timestamp = Date.now();
  const params = {
    ...orderParams,
    timestamp: timestamp
  };

  const queryString = new URLSearchParams(params).toString();
  const signature = await createSignature(queryString, apiKeys.api_secret);
  
  const response = await fetch('https://fapi.binance.com/fapi/v1/order', {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKeys.api_key,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `${queryString}&signature=${signature}`
  });

  const data = await response.json();
  console.log('🟡 BINANCE CANCEL FIXED: Order response:', data);
  
  if (response.ok) {
    return { success: true, data: data };
  } else {
    return { success: false, error: data.msg || 'Unknown error' };
  }
}

// Закрытие позиций
async function handleClosePositions(apiKeys: any) {
  console.log('🟡 BINANCE CANCEL FIXED: Closing positions');
  
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const positionsResponse = await fetch(`https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
      },
    });

    const positions = await positionsResponse.json();
    let closedCount = 0;

    if (Array.isArray(positions)) {
      for (const position of positions) {
        const positionAmt = parseFloat(position.positionAmt);
        if (positionAmt !== 0) {
          const closeOrder = await placeOrder(apiKeys, {
            symbol: position.symbol,
            side: positionAmt > 0 ? 'SELL' : 'BUY',
            type: 'MARKET',
            quantity: Math.abs(positionAmt).toString(),
            reduceOnly: 'true'
          });
          
          if (closeOrder.success) {
            closedCount++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: `Binance позиции закрыты: ${closedCount}`,
          closed_positions: closedCount,
          exchange: 'BINANCE'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Close positions error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена ордеров - ПОЛНОСТЬЮ ПЕРЕПИСАНО
async function handleCancelOrders(apiKeys: any) {
  console.log('🟡 BINANCE CANCEL FIXED: Starting cancel orders');
  
  try {
    let cancelledCount = 0;
    const cancelledOrders = [];
    
    // 1. Сначала получаем все открытые ордера
    const timestamp1 = Date.now();
    const queryString1 = `timestamp=${timestamp1}`;
    const signature1 = await createSignature(queryString1, apiKeys.api_secret);
    
    const openOrdersResponse = await fetch(`https://fapi.binance.com/fapi/v1/openOrders?${queryString1}&signature=${signature1}`, {
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
      },
    });

    const openOrders = await openOrdersResponse.json();
    console.log('🟡 BINANCE CANCEL FIXED: Open orders:', openOrders);

    if (Array.isArray(openOrders) && openOrders.length > 0) {
      // 2. Отменяем каждый ордер по отдельности
      for (const order of openOrders) {
        try {
          const timestamp2 = Date.now();
          const cancelParams = {
            symbol: order.symbol,
            orderId: order.orderId,
            timestamp: timestamp2
          };
          
          const queryString2 = new URLSearchParams(cancelParams).toString();
          const signature2 = await createSignature(queryString2, apiKeys.api_secret);
          
          const cancelResponse = await fetch('https://fapi.binance.com/fapi/v1/order', {
            method: 'DELETE',
            headers: {
              'X-MBX-APIKEY': apiKeys.api_key,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `${queryString2}&signature=${signature2}`
          });

          const cancelData = await cancelResponse.json();
          console.log('🟡 BINANCE CANCEL FIXED: Cancel response:', cancelData);
          
          if (cancelResponse.ok) {
            cancelledCount++;
            cancelledOrders.push({
              orderId: order.orderId,
              symbol: order.symbol,
              status: 'CANCELLED'
            });
          }
        } catch (e) {
          console.log('🟡 BINANCE CANCEL FIXED: Error cancelling order:', e);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: `Binance ордера отменены: ${cancelledCount}`,
          cancelled_orders: cancelledCount,
          total_open_orders: Array.isArray(openOrders) ? openOrders.length : 0,
          exchange: 'BINANCE',
          details: cancelledOrders
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('🟡 BINANCE CANCEL FIXED: Cancel error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Cancel orders error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Создание подписи
async function createSignature(queryString: string, secret: string) {
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