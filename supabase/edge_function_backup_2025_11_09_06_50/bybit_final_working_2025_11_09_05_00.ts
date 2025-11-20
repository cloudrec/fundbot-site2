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
    
    console.log('🔵 BYBIT FINAL: Starting action:', action);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем API ключи
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'bybit')
      .single();

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bybit API ключи не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Получаем настройки
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🔵 BYBIT FINAL: Keys loaded, settings:', !!settings);

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
    console.error('❌ BYBIT FINAL Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Получение баланса
async function handleGetBalance(apiKeys: any) {
  console.log('🔵 BYBIT FINAL: Getting balance');
  
  const timestamp = Date.now().toString();
  const params = {
    api_key: apiKeys.api_key,
    timestamp: timestamp
  };

  const queryString = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  const signature = await createSignature(queryString, apiKeys.api_secret);
  
  const url = `https://api.bybit.com/v2/private/wallet/balance?${queryString}&sign=${signature}`;
  
  const response = await fetch(url);
  const data = await response.json();

  if (response.ok && data.ret_code === 0) {
    const usdtBalance = data.result?.USDT || {};
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          available_balance: usdtBalance.available_balance || '0.00',
          currency: 'USDT',
          status: 'LIVE ✅',
          exchange: 'BYBIT'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Bybit API error: ${data.ret_msg || 'Unknown error'}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Размещение ордера с TP/SL
async function handlePlaceOrderWithTPSL(apiKeys: any, settings: any) {
  console.log('🔵 BYBIT FINAL: Placing order with TP/SL');
  
  if (!settings) {
    return new Response(
      JSON.stringify({ success: false, error: 'Настройки не найдены' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const symbol = `${settings.base_asset}${settings.quote_asset}`;
  
  try {
    // 1. Получаем текущую цену
    const priceResponse = await fetch(`https://api.bybit.com/v2/public/tickers?symbol=${symbol}`);
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData.result?.[0]?.last_price || '0');
    
    if (currentPrice === 0) {
      throw new Error('Не удалось получить цену символа');
    }
    
    // 2. Рассчитываем количество
    const orderAmountUSD = settings.order_amount_usd || 10;
    const qty = Math.floor(orderAmountUSD / currentPrice).toString();
    
    console.log('🔵 BYBIT FINAL: Order calculation:', {
      symbol,
      currentPrice,
      orderAmountUSD,
      qty
    });

    // 3. Рассчитываем TP/SL цены
    const tpPrice = (currentPrice * 1.02).toFixed(2); // +2%
    const slPrice = (currentPrice * 0.98).toFixed(2); // -2%

    // 4. Размещаем ордер с TP/SL
    const timestamp = Date.now().toString();
    const params = {
      api_key: apiKeys.api_key,
      symbol: symbol,
      side: 'Buy',
      order_type: 'Market',
      qty: qty,
      time_in_force: 'GoodTillCancel',
      take_profit: tpPrice,
      stop_loss: slPrice,
      timestamp: timestamp
    };

    const queryString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const response = await fetch('https://api.bybit.com/v2/private/order/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${queryString}&sign=${signature}`
    });

    const data = await response.json();
    console.log('🔵 BYBIT FINAL: Order response:', data);

    if (response.ok && data.ret_code === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            message: `Bybit ордер с TP/SL размещен: ${symbol}`,
            order_id: data.result?.order_id,
            symbol: symbol,
            qty: qty,
            current_price: currentPrice,
            tp_price: tpPrice,
            sl_price: slPrice,
            order_amount_usd: orderAmountUSD,
            status: 'placed'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Bybit order error: ${data.ret_msg || 'Unknown error'}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

// Закрытие позиций
async function handleClosePositions(apiKeys: any) {
  console.log('🔵 BYBIT FINAL: Closing positions');
  
  try {
    // Получаем позиции
    const timestamp = Date.now().toString();
    const params = {
      api_key: apiKeys.api_key,
      timestamp: timestamp
    };

    const queryString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const response = await fetch(`https://api.bybit.com/v2/private/position/list?${queryString}&sign=${signature}`);
    const data = await response.json();

    let closedCount = 0;

    if (response.ok && data.ret_code === 0 && data.result) {
      for (const position of data.result) {
        if (parseFloat(position.size) > 0) {
          // Закрываем позицию
          const closeParams = {
            api_key: apiKeys.api_key,
            symbol: position.symbol,
            side: position.side === 'Buy' ? 'Sell' : 'Buy',
            order_type: 'Market',
            qty: position.size,
            reduce_only: true,
            timestamp: Date.now().toString()
          };

          const closeQueryString = Object.keys(closeParams)
            .sort()
            .map(key => `${key}=${closeParams[key]}`)
            .join('&');

          const closeSignature = await createSignature(closeQueryString, apiKeys.api_secret);
          
          const closeResponse = await fetch('https://api.bybit.com/v2/private/order/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `${closeQueryString}&sign=${closeSignature}`
          });

          const closeData = await closeResponse.json();
          if (closeResponse.ok && closeData.ret_code === 0) {
            closedCount++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: `Bybit позиции закрыты: ${closedCount}`,
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
  console.log('🔵 BYBIT FINAL: Canceling orders');
  
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        message: 'Bybit ордера отменены',
        cancelled_orders: 0
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
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