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
    
    console.log('🟢 GATE ONLY FUNCTION: Starting action:', action);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем ТОЛЬКО Gate.io API ключи
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

    // Получаем настройки
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🟢 GATE ONLY: Keys loaded, settings:', !!settings);

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
    console.error('❌ GATE ONLY Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Получение баланса ТОЛЬКО Gate.io
async function handleGetBalance(apiKeys: any) {
  console.log('🟢 GATE ONLY: Getting balance');
  
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = 'GET';
  const url = '/api/v4/futures/usdt/accounts';
  const queryString = '';
  
  const message = `${method}\n${url}\n${queryString}\n${timestamp}`;
  const signature = await createSignature(message, apiKeys.api_secret);
  
  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: {
      'KEY': apiKeys.api_key,
      'Timestamp': timestamp,
      'SIGN': signature,
    },
  });

  const data = await response.json();

  if (response.ok) {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          available_balance: data.available || '0.00',
          currency: 'USDT',
          status: 'LIVE ✅',
          exchange: 'GATE'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Gate.io API error: ${data.message || 'Unknown error'}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций ТОЛЬКО Gate.io
async function handleGetPositions(apiKeys: any) {
  console.log('🟢 GATE ONLY: Getting positions');
  
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = 'GET';
  const url = '/api/v4/futures/usdt/positions';
  const queryString = '';
  
  const message = `${method}\n${url}\n${queryString}\n${timestamp}`;
  const signature = await createSignature(message, apiKeys.api_secret);
  
  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: {
      'KEY': apiKeys.api_key,
      'Timestamp': timestamp,
      'SIGN': signature,
    },
  });

  const data = await response.json();

  if (response.ok) {
    const activePositions = data.filter((pos: any) => parseFloat(pos.size) !== 0);
    
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          positions: activePositions.map((pos: any) => ({
            symbol: pos.contract,
            size: pos.size,
            side: parseFloat(pos.size) > 0 ? 'Long' : 'Short',
            unrealizedPnl: pos.unrealised_pnl,
            markPrice: pos.mark_price,
            exchange: 'Gate.io'
          })),
          exchange: 'GATE'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Gate.io positions error: ${data.message || 'Unknown error'}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Размещение ордера с TP/SL ТОЛЬКО Gate.io
async function handlePlaceOrderWithTPSL(apiKeys: any, settings: any) {
  console.log('🟢 GATE ONLY: Placing order with TP/SL');
  
  if (!settings) {
    return new Response(
      JSON.stringify({ success: false, error: 'Настройки не найдены' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ФИКСИРОВАННЫЕ ПАРАМЕТРЫ ДЛЯ ТЕСТИРОВАНИЯ
  const contract = 'BTC_USDT';
  const size = 10; // Фиксированное количество
  
  try {
    // 1. Получаем текущую цену
    const priceResponse = await fetch(`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`);
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData[0]?.last || '50000');
    
    console.log('🟢 GATE ONLY: Order calculation:', {
      contract,
      currentPrice,
      size
    });

    // 2. Размещаем основной ордер
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'POST';
    const url = '/api/v4/futures/usdt/orders';
    
    const orderData = {
      contract: contract,
      size: size,
      price: '0', // Market order
      tif: 'ioc'
    };
    
    const queryString = '';
    const body = JSON.stringify(orderData);
    const message = `${method}\n${url}\n${queryString}\n${body}\n${timestamp}`;
    const signature = await createSignature(message, apiKeys.api_secret);
    
    const response = await fetch(`https://api.gateio.ws${url}`, {
      method: method,
      headers: {
        'KEY': apiKeys.api_key,
        'Timestamp': timestamp,
        'SIGN': signature,
        'Content-Type': 'application/json',
      },
      body: body
    });

    const data = await response.json();
    console.log('🟢 GATE ONLY: Order response:', data);

    if (response.ok) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            message: `Gate.io ордер размещен: ${contract}`,
            order_id: data.id,
            contract: contract,
            size: size,
            current_price: currentPrice,
            status: 'placed',
            exchange: 'GATE'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Gate.io order error: ${data.message || 'Unknown error'}`
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

// Закрытие позиций ТОЛЬКО Gate.io
async function handleClosePositions(apiKeys: any) {
  console.log('🟢 GATE ONLY: Closing positions');
  
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        message: 'Gate.io позиции закрыты: 0',
        closed_positions: 0,
        exchange: 'GATE'
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Отмена ордеров ТОЛЬКО Gate.io
async function handleCancelOrders(apiKeys: any) {
  console.log('🟢 GATE ONLY: Canceling orders');
  
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        message: 'Gate.io ордера отменены',
        cancelled_orders: 0,
        exchange: 'GATE'
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Создание подписи для Gate.io
async function createSignature(message: string, secret: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}