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
    
    console.log('🟡 BINANCE FIXED: Starting action:', action);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем API ключи
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

    console.log('🟡 BINANCE FIXED: Keys loaded, settings:', !!settings);

    // Обработка разных действий
    switch (action) {
      case 'get_balance':
        return await handleGetBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handlePlaceOrderWithTPSL(apiKeys, settings);
      
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
    console.error('❌ BINANCE FIXED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Получение баланса
async function handleGetBalance(apiKeys: any) {
  console.log('🟡 BINANCE FIXED: Getting balance');
  
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

// Размещение ордера с TP/SL
async function handlePlaceOrderWithTPSL(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE FIXED: Placing order with TP/SL');
  
  if (!settings) {
    return new Response(
      JSON.stringify({ success: false, error: 'Настройки не найдены' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ✅ ИСПРАВЛЕНО: Используем quoteOrderQty для указания суммы в USDT
  const symbol = `${settings.base_asset}${settings.quote_asset}`;
  const orderAmountUSD = settings.order_amount_usd || 10;
  
  console.log('🟡 BINANCE FIXED: Order params:', { 
    symbol, 
    quoteOrderQty: orderAmountUSD,
    type: 'MARKET'
  });
  
  try {
    // 1. Размещаем основной ордер используя quoteOrderQty
    const mainOrder = await placeOrder(apiKeys, {
      symbol: symbol,
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: orderAmountUSD.toString() // ✅ Сумма в USDT
    });

    if (!mainOrder.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Main order failed: ${mainOrder.error}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Получаем информацию о выполненном ордере
    const executedQty = mainOrder.data.executedQty || '0';
    const avgPrice = mainOrder.data.avgPrice || mainOrder.data.price || '0';

    // 3. Размещаем Take Profit ордер (если есть количество)
    let tpOrder = { success: false, data: null };
    let slOrder = { success: false, data: null };

    if (parseFloat(executedQty) > 0) {
      const currentPrice = parseFloat(avgPrice);
      
      // Take Profit: +2%
      const tpPrice = (currentPrice * 1.02).toFixed(2);
      tpOrder = await placeOrder(apiKeys, {
        symbol: symbol,
        side: 'SELL',
        type: 'LIMIT',
        quantity: executedQty,
        price: tpPrice,
        timeInForce: 'GTC'
      });

      // Stop Loss: -2%
      const slPrice = (currentPrice * 0.98).toFixed(2);
      slOrder = await placeOrder(apiKeys, {
        symbol: symbol,
        side: 'SELL',
        type: 'STOP_MARKET',
        quantity: executedQty,
        stopPrice: slPrice
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: `Binance ордер с TP/SL размещен: ${symbol} на $${orderAmountUSD}`,
          main_order_id: mainOrder.data.orderId,
          tp_order_id: tpOrder.success ? tpOrder.data.orderId : null,
          sl_order_id: slOrder.success ? slOrder.data.orderId : null,
          symbol: symbol,
          quoteOrderQty: orderAmountUSD,
          executedQty: executedQty,
          avgPrice: avgPrice
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
  console.log('🟡 BINANCE FIXED: Order response:', data);
  
  if (response.ok) {
    return { success: true, data: data };
  } else {
    return { success: false, error: data.msg || 'Unknown error' };
  }
}

// Закрытие позиций
async function handleClosePositions(apiKeys: any) {
  console.log('🟡 BINANCE FIXED: Closing positions');
  
  try {
    // Получаем открытые позиции
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
          // Закрываем позицию рыночным ордером
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
          closed_positions: closedCount
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

// Отмена ордеров
async function handleCancelOrders(apiKeys: any) {
  console.log('🟡 BINANCE FIXED: Canceling orders');
  
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const response = await fetch(`https://fapi.binance.com/fapi/v1/allOpenOrders?${queryString}&signature=${signature}`, {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
      },
    });

    const data = await response.json();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: 'Binance ордера отменены',
          cancelled_orders: Array.isArray(data) ? data.length : 0
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
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