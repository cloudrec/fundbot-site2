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
    
    console.log('🎯 GATE.IO FIXED SHORT: Starting action:', action);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем ключи
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ success: false, error: 'Gate.io API ключи не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Получаем настройки (любые настройки пользователя)
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🎯 GATE.IO FIXED SHORT: Keys loaded, settings:', !!settings);

    // Обработка разных действий
    switch (action) {
      case 'get_balance':
        return await handleGetBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handlePlaceOrderWithTPSL(apiKeys, settings);
      
      case 'get_positions':
        return await handleGetPositions(apiKeys);
      
      case 'cancel_all_orders':
        return await handleCancelAllOrders(apiKeys);
      
      case 'close_all_positions':
        return await handleCloseAllPositions(apiKeys);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ GATE.IO FIXED SHORT Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Функция для создания подписи (официальный алгоритм)
async function createSignature(method: string, url: string, queryString: string, payloadString: string, apiSecret: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  // Хешируем payload
  const encoder = new TextEncoder();
  const payloadData = encoder.encode(payloadString);
  const payloadHash = await crypto.subtle.digest('SHA-512', payloadData);
  const hashedPayload = Array.from(new Uint8Array(payloadHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Создаем строку для подписи
  const signatureString = `${method}\n${url}\n${queryString}\n${hashedPayload}\n${timestamp}`;
  
  // Создаем HMAC подпись
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(signatureString);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const result = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return { timestamp, signature: result, hashedPayload, signatureString };
}

// Получение баланса
async function handleGetBalance(apiKeys: any) {
  console.log('🎯 GATE.IO FIXED SHORT: Getting balance');
  
  const method = 'GET';
  const url = '/api/v4/futures/usdt/accounts';
  const queryString = '';
  const payloadString = '';

  const { timestamp, signature } = await createSignature(method, url, queryString, payloadString, apiKeys.api_secret);

  const headers = {
    'KEY': apiKeys.api_key,
    'Timestamp': timestamp,
    'SIGN': signature,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: headers
  });

  const responseData = await response.json();

  if (response.status === 200) {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          available_balance: responseData.available || '0.00',
          currency: 'USDT',
          status: '✅ ПОДКЛЮЧЕНО',
          exchange: 'GATE.IO',
          note: 'Успешно подключено к Gate.io',
          setup_required: false
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          available_balance: '0.00',
          currency: 'USDT',
          status: '❌ ОШИБКА API',
          exchange: 'GATE.IO',
          note: `Ошибка: ${responseData.message || 'Unknown error'}`,
          setup_required: true
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ✅ РАЗМЕЩЕНИЕ SHORT ОРДЕРА С TP/SL
async function handlePlaceOrderWithTPSL(apiKeys: any, settings: any) {
  console.log('🎯 GATE.IO FIXED SHORT: Placing SHORT order with TP/SL');
  
  if (!settings) {
    console.log('❌ GATE.IO FIXED SHORT: No settings found');
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Настройки торговли не найдены. Сохраните настройки на вкладке торговли.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const contract = `${settings.base_asset}_${settings.quote_asset}`;
  console.log('🎯 GATE.IO FIXED SHORT: Contract:', contract);
  
  // Получаем текущую цену
  const tickerResponse = await fetch(`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`);
  const tickerData = await tickerResponse.json();
  
  if (!tickerData || tickerData.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Не удалось получить цену для ${contract}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const currentPrice = parseFloat(tickerData[0].last);
  const orderAmount = settings.order_amount_usd || 10;
  const leverage = settings.leverage || 10;
  const baseSize = Math.floor((orderAmount * leverage) / currentPrice);
  
  // ✅ ИСПРАВЛЕНО: Размещаем SHORT ордер (отрицательный размер)
  const shortSize = -baseSize; // Отрицательный размер = SHORT

  // ✅ ИСПРАВЛЕНО: TP и SL для SHORT позиции
  const tpPercent = settings.take_profit_percent || 0.5;
  const slPercent = settings.stop_loss_percent || 1.0;
  
  // Для SHORT: TP ниже текущей цены, SL выше текущей цены
  const tpPrice = currentPrice * (1 - tpPercent / 100); // TP ниже для SHORT
  const slPrice = currentPrice * (1 + slPercent / 100); // SL выше для SHORT

  console.log('🎯 GATE.IO FIXED SHORT: Order params:', {
    contract,
    baseSize,
    shortSize,
    currentPrice,
    orderAmount,
    leverage,
    tpPrice,
    slPrice,
    direction: 'SHORT'
  });

  try {
    // 1. Размещаем основной SHORT ордер
    const mainOrderData = {
      contract: contract,
      size: shortSize, // ✅ Отрицательный размер = SHORT
      price: currentPrice.toString(),
      tif: 'gtc',
      text: 't-skywork_short_main'
    };

    const mainOrderResult = await placeOrder(apiKeys, mainOrderData);
    
    if (!mainOrderResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Ошибка размещения SHORT ордера: ${mainOrderResult.error}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Размещаем TP ордер (закрытие SHORT = покупка)
    const tpOrderData = {
      contract: contract,
      size: baseSize, // ✅ Положительный размер для закрытия SHORT
      price: tpPrice.toFixed(4),
      tif: 'gtc',
      text: 't-skywork_short_tp',
      reduce_only: true
    };

    const tpOrderResult = await placeOrder(apiKeys, tpOrderData);

    // 3. Размещаем SL ордер (закрытие SHORT = покупка)
    const slOrderData = {
      contract: contract,
      size: baseSize, // ✅ Положительный размер для закрытия SHORT
      price: slPrice.toFixed(4),
      tif: 'gtc',
      text: 't-skywork_short_sl',
      reduce_only: true
    };

    const slOrderResult = await placeOrder(apiKeys, slOrderData);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: `GATE.IO SHORT ордер с TP/SL размещен: ${contract}`,
          main_order_id: mainOrderResult.data.order_id,
          tp_order_id: tpOrderResult.success ? tpOrderResult.data.order_id : null,
          sl_order_id: slOrderResult.success ? slOrderResult.data.order_id : null,
          contract: contract,
          size: shortSize,
          direction: 'SHORT',
          price: currentPrice,
          tp_price: tpPrice,
          sl_price: slPrice,
          status: 'short_with_tp_sl',
          exchange: 'GATE.IO'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Ошибка размещения SHORT ордера с TP/SL: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Вспомогательная функция для размещения ордера
async function placeOrder(apiKeys: any, orderData: any) {
  const method = 'POST';
  const url = '/api/v4/futures/usdt/orders';
  const queryString = '';
  const payloadString = JSON.stringify(orderData);

  const { timestamp, signature } = await createSignature(method, url, queryString, payloadString, apiKeys.api_secret);

  const headers = {
    'KEY': apiKeys.api_key,
    'Timestamp': timestamp,
    'SIGN': signature,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  console.log('🎯 GATE.IO FIXED SHORT: Placing order:', orderData);

  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: headers,
    body: payloadString
  });

  const responseData = await response.json();
  console.log('🎯 GATE.IO FIXED SHORT: Order response:', responseData);

  if (response.status === 201) {
    return {
      success: true,
      data: {
        order_id: responseData.id,
        status: 'placed'
      }
    };
  } else {
    return {
      success: false,
      error: responseData.message || 'Unknown error'
    };
  }
}

// Получение позиций
async function handleGetPositions(apiKeys: any) {
  console.log('🎯 GATE.IO FIXED SHORT: Getting positions');
  
  const method = 'GET';
  const url = '/api/v4/futures/usdt/positions';
  const queryString = '';
  const payloadString = '';

  const { timestamp, signature } = await createSignature(method, url, queryString, payloadString, apiKeys.api_secret);

  const headers = {
    'KEY': apiKeys.api_key,
    'Timestamp': timestamp,
    'SIGN': signature,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: headers
  });

  const responseData = await response.json();
  console.log('🎯 GATE.IO FIXED SHORT: Positions response:', responseData);

  if (response.status === 200) {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          positions: responseData || [],
          exchange: 'GATE.IO'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Ошибка получения позиций: ${responseData.message || 'Unknown error'}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена всех ордеров
async function handleCancelAllOrders(apiKeys: any) {
  console.log('🎯 GATE.IO FIXED SHORT: Cancelling all orders');
  
  const method = 'DELETE';
  const url = '/api/v4/futures/usdt/orders';
  const queryString = '';
  const payloadString = '';

  const { timestamp, signature } = await createSignature(method, url, queryString, payloadString, apiKeys.api_secret);

  const headers = {
    'KEY': apiKeys.api_key,
    'Timestamp': timestamp,
    'SIGN': signature,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: headers
  });

  const responseData = await response.json();
  console.log('🎯 GATE.IO FIXED SHORT: Cancel orders response:', responseData);

  return new Response(
    JSON.stringify({
      success: response.status === 200,
      data: {
        message: response.status === 200 ? 'Все ордера Gate.io отменены' : 'Ошибка отмены ордеров',
        cancelled_orders: responseData || [],
        exchange: 'GATE.IO'
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ✅ ИСПРАВЛЕННОЕ ЗАКРЫТИЕ ПОЗИЦИЙ - используем reduce_only ордера
async function handleCloseAllPositions(apiKeys: any) {
  console.log('🎯 GATE.IO FIXED SHORT: Closing all positions with reduce_only');
  
  // Сначала получаем все позиции
  const positionsResult = await handleGetPositions(apiKeys);
  const positionsData = await positionsResult.json();
  
  if (!positionsData.success || !positionsData.data.positions) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Не удалось получить позиции для закрытия'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const allPositions = positionsData.data.positions;
  const openPositions = allPositions.filter((pos: any) => parseFloat(pos.size || 0) !== 0);
  
  console.log('🎯 GATE.IO FIXED SHORT: Found positions:', allPositions.length, 'open:', openPositions.length);
  
  if (openPositions.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: 'Нет открытых позиций для закрытия',
          closed_positions: 0,
          exchange: 'GATE.IO'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ✅ ИСПРАВЛЕНО: Закрываем позиции через reduce_only ордера
  const results = [];
  for (const position of openPositions) {
    try {
      const positionSize = parseFloat(position.size);
      const closeSize = -positionSize; // Противоположное направление
      
      console.log(`🎯 GATE.IO FIXED SHORT: Closing position ${position.contract}, size: ${positionSize} -> ${closeSize}`);
      
      // ✅ ИСПОЛЬЗУЕМ REDUCE_ONLY ОРДЕР
      const closeOrderData = {
        contract: position.contract,
        size: closeSize,
        reduce_only: true, // ✅ КЛЮЧЕВОЕ ПОЛЕ для закрытия позиций
        text: 't-close_position'
        // НЕ указываем price и tif для reduce_only ордера
      };

      const method = 'POST';
      const url = '/api/v4/futures/usdt/orders';
      const queryString = '';
      const payloadString = JSON.stringify(closeOrderData);

      const { timestamp, signature } = await createSignature(method, url, queryString, payloadString, apiKeys.api_secret);

      const headers = {
        'KEY': apiKeys.api_key,
        'Timestamp': timestamp,
        'SIGN': signature,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };

      console.log('🎯 GATE.IO FIXED SHORT: Placing reduce_only order:', closeOrderData);

      const response = await fetch(`https://api.gateio.ws${url}`, {
        method: method,
        headers: headers,
        body: payloadString
      });

      const responseData = await response.json();
      console.log('🎯 GATE.IO FIXED SHORT: Close order response:', responseData);
      
      results.push({
        contract: position.contract,
        status: response.status === 201 ? 'closed' : 'error',
        order_id: response.status === 201 ? responseData.id : null,
        error: response.status !== 201 ? responseData.message : null
      });

      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      results.push({
        contract: position.contract,
        status: 'error',
        error: error.message
      });
    }
  }

  const successCount = results.filter(r => r.status === 'closed').length;

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        message: `Закрыто позиций Gate.io: ${successCount}/${openPositions.length}`,
        closed_positions: successCount,
        total_positions: openPositions.length,
        results: results,
        exchange: 'GATE.IO'
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}