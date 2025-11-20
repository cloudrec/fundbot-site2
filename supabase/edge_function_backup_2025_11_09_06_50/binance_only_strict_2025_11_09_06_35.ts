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
    
    console.log('🟡 BINANCE ONLY: Starting action:', action, 'for user:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // СТРОГО ТОЛЬКО BINANCE API КЛЮЧИ
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'binance')
      .single();

    if (keysError || !apiKeys) {
      console.log('🟡 BINANCE ONLY: No Binance API keys found');
      return new Response(
        JSON.stringify({ success: false, error: 'Binance API ключи не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🟡 BINANCE ONLY: Binance API keys loaded successfully');

    // Получаем настройки
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    // Обработка разных действий ТОЛЬКО для Binance
    switch (action) {
      case 'get_balance':
        return await handleBinanceBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handleBinanceOrder(apiKeys, settings);
      
      case 'get_positions':
        return await handleBinancePositions(apiKeys);
      
      case 'close_positions':
      case 'close_all_positions':
        return await handleBinanceClosePositions(apiKeys);
      
      case 'cancel_orders':
      case 'cancel_all_orders':
        return await handleBinanceCancelOrders(apiKeys);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ BINANCE ONLY Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ТОЛЬКО BINANCE БАЛАНС
async function handleBinanceBalance(apiKeys: any) {
  console.log('🟡 BINANCE ONLY: Getting Binance balance');
  
  try {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Защита от бана
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const url = `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`;
    
    const response = await fetch(url, {
      headers: { 'X-MBX-APIKEY': apiKeys.api_key },
    });

    const data = await response.json();

    if (response.ok) {
      const usdtBalance = data.assets?.find((asset: any) => asset.asset === 'USDT');
      console.log('🟡 BINANCE ONLY: Balance retrieved successfully:', usdtBalance?.availableBalance);
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            available_balance: usdtBalance?.availableBalance || '0.00',
            currency: 'USDT',
            status: 'BINANCE LIVE ✅',
            exchange: 'BINANCE'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      if (data.msg && data.msg.includes('banned')) {
        console.log('🟡 BINANCE ONLY: IP banned, returning safe result');
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              available_balance: '0.00',
              currency: 'USDT',
              status: 'BINANCE IP BANNED ⚠️',
              exchange: 'BINANCE'
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Binance API error: ${data.msg || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('🟡 BINANCE ONLY: Balance error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Binance balance error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ТОЛЬКО BINANCE ПОЗИЦИИ
async function handleBinancePositions(apiKeys: any) {
  console.log('🟡 BINANCE ONLY: Getting Binance positions');
  
  try {
    await new Promise(resolve => setTimeout(resolve, 1500)); // Защита от бана
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const url = `https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`;
    
    const response = await fetch(url, {
      headers: { 'X-MBX-APIKEY': apiKeys.api_key },
    });

    const data = await response.json();

    if (response.ok) {
      const activePositions = data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
      console.log('🟡 BINANCE ONLY: Found', activePositions.length, 'active positions');
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            positions: activePositions.map((pos: any) => ({
              symbol: pos.symbol,
              size: pos.positionAmt,
              side: parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT',
              unrealizedPnl: pos.unRealizedProfit,
              markPrice: pos.markPrice,
              entryPrice: pos.entryPrice,
              exchange: 'BINANCE'
            })),
            exchange: 'BINANCE'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      if (data.msg && data.msg.includes('banned')) {
        console.log('🟡 BINANCE ONLY: IP banned for positions');
        return new Response(
          JSON.stringify({
            success: true,
            data: { positions: [], exchange: 'BINANCE' }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Binance positions error: ${data.msg || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('🟡 BINANCE ONLY: Positions error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Binance positions error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ТОЛЬКО BINANCE ОРДЕР
async function handleBinanceOrder(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE ONLY: Placing Binance order');
  
  if (!settings) {
    return new Response(
      JSON.stringify({ success: false, error: 'Настройки не найдены' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const symbol = 'BTCUSDT';
  const quantity = '0.001';
  
  try {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Защита от бана
    
    // Получаем информацию о символе
    const exchangeInfoResponse = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const exchangeInfo = await exchangeInfoResponse.json();
    
    const symbolInfo = exchangeInfo.symbols?.find((s: any) => s.symbol === symbol);
    const priceFilter = symbolInfo?.filters?.find((f: any) => f.filterType === 'PRICE_FILTER');
    const tickSize = parseFloat(priceFilter?.tickSize || '0.01');
    
    // Получаем текущую цену
    await new Promise(resolve => setTimeout(resolve, 500));
    const priceResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData.price);
    
    // Рассчитываем TP/SL цены
    const tpPriceRaw = currentPrice * 1.02; // +2%
    const slPriceRaw = currentPrice * 0.98; // -2%
    
    const tpPrice = (Math.round(tpPriceRaw / tickSize) * tickSize).toFixed(2);
    const slPrice = (Math.round(slPriceRaw / tickSize) * tickSize).toFixed(2);
    
    console.log('🟡 BINANCE ONLY: Calculated prices:', { currentPrice, tpPrice, slPrice });

    // Размещаем основной ордер
    await new Promise(resolve => setTimeout(resolve, 1000));
    const mainOrderResult = await placeBinanceOrder(apiKeys, {
      symbol: symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: quantity
    });

    if (!mainOrderResult.success) {
      throw new Error(`Main order failed: ${mainOrderResult.error}`);
    }

    // Размещаем TP ордер
    await new Promise(resolve => setTimeout(resolve, 1500));
    const tpOrderResult = await placeBinanceOrder(apiKeys, {
      symbol: symbol,
      side: 'SELL',
      type: 'TAKE_PROFIT_MARKET',
      quantity: quantity,
      stopPrice: tpPrice,
      reduceOnly: 'true'
    });

    // Размещаем SL ордер
    await new Promise(resolve => setTimeout(resolve, 1500));
    const slOrderResult = await placeBinanceOrder(apiKeys, {
      symbol: symbol,
      side: 'SELL',
      type: 'STOP_MARKET',
      quantity: quantity,
      stopPrice: slPrice,
      reduceOnly: 'true'
    });

    console.log('🟡 BINANCE ONLY: Order placed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: `BINANCE ордер размещен: ${symbol}`,
          order_id: mainOrderResult.data.orderId,
          tp_order_id: tpOrderResult.success ? tpOrderResult.data.orderId : null,
          sl_order_id: slOrderResult.success ? slOrderResult.data.orderId : null,
          symbol: symbol,
          quantity: quantity,
          current_price: currentPrice,
          tp_price: tpPrice,
          sl_price: slPrice,
          tp_error: tpOrderResult.success ? null : tpOrderResult.error,
          sl_error: slOrderResult.success ? null : slOrderResult.error,
          exchange: 'BINANCE'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('🟡 BINANCE ONLY: Order error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Binance order error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ТОЛЬКО BINANCE ЗАКРЫТИЕ ПОЗИЦИЙ
async function handleBinanceClosePositions(apiKeys: any) {
  console.log('🟡 BINANCE ONLY: Closing Binance positions');
  
  try {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const positionsResponse = await fetch(`https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKeys.api_key },
    });

    const positions = await positionsResponse.json();
    let closedCount = 0;

    if (Array.isArray(positions)) {
      for (const position of positions) {
        const positionAmt = parseFloat(position.positionAmt);
        if (positionAmt !== 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const closeOrder = await placeBinanceOrder(apiKeys, {
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

    console.log('🟡 BINANCE ONLY: Closed', closedCount, 'positions');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: `BINANCE позиции закрыты: ${closedCount}`,
          closed_positions: closedCount,
          exchange: 'BINANCE'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('🟡 BINANCE ONLY: Close positions error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Binance close positions error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ТОЛЬКО BINANCE ОТМЕНА ОРДЕРОВ
async function handleBinanceCancelOrders(apiKeys: any) {
  console.log('🟡 BINANCE ONLY: Canceling Binance orders');
  
  try {
    let cancelledCount = 0;
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const timestamp1 = Date.now();
    const queryString1 = `timestamp=${timestamp1}`;
    const signature1 = await createSignature(queryString1, apiKeys.api_secret);
    
    const openOrdersResponse = await fetch(`https://fapi.binance.com/fapi/v1/openOrders?${queryString1}&signature=${signature1}`, {
      headers: { 'X-MBX-APIKEY': apiKeys.api_key },
    });

    const openOrders = await openOrdersResponse.json();

    if (Array.isArray(openOrders) && openOrders.length > 0) {
      for (const order of openOrders) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
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

          if (cancelResponse.ok) {
            cancelledCount++;
          }
        } catch (e) {
          console.log('🟡 BINANCE ONLY: Error cancelling order:', e);
        }
      }
    }

    console.log('🟡 BINANCE ONLY: Cancelled', cancelledCount, 'orders');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: `BINANCE ордера отменены: ${cancelledCount}`,
          cancelled_orders: cancelledCount,
          total_open_orders: Array.isArray(openOrders) ? openOrders.length : 0,
          exchange: 'BINANCE'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('🟡 BINANCE ONLY: Cancel orders error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Binance cancel orders error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Вспомогательная функция для размещения ордера
async function placeBinanceOrder(apiKeys: any, orderParams: any) {
  const timestamp = Date.now();
  const params = { ...orderParams, timestamp: timestamp };
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
  
  if (response.ok) {
    return { success: true, data: data };
  } else {
    return { success: false, error: data.msg || 'Unknown error' };
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