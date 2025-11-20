import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  console.log('=== REAL TRADING ONLY ===');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, exchange, symbol, user_id, ...params } = await req.json();
    
    console.log('🔥 REAL Trading operation:', { action, exchange, symbol, user_id, params });

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // Получаем API ключи пользователя
    const { data: apiKeyData, error: apiKeyError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', exchange)
      .single();

    if (apiKeyError || !apiKeyData) {
      throw new Error(`API ключи для биржи ${exchange} не найдены. Добавьте их в разделе API Ключи.`);
    }

    // Получаем настройки торговли пользователя
    const { data: settingsData, error: settingsError } = await supabaseClient
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settingsData) {
      throw new Error('Настройки торговли не найдены. Настройте их в разделе Настройки.');
    }

    console.log('🔥 Found API keys and settings');

    let result;
    switch (action) {
      case 'get_balance':
        result = await getRealBalance(exchange, apiKeyData);
        break;
      case 'place_order_with_tp_sl':
        result = await placeRealOrderWithTPSL(exchange, apiKeyData, symbol, params, settingsData);
        break;
      case 'place_test_order':
        result = await placeRealTestOrder(exchange, apiKeyData, symbol, params, settingsData);
        break;
      case 'get_positions':
        result = await getRealPositions(exchange, apiKeyData);
        break;
      case 'close_positions':
        result = await closeRealPositions(exchange, apiKeyData, symbol);
        break;
      case 'cancel_orders':
        result = await cancelRealOrders(exchange, apiKeyData, symbol);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
        message: `${action} completed successfully`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('🔥 REAL Trading Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function placeRealOrderWithTPSL(exchange: string, apiKeys: any, symbol: string, params: any, settings: any) {
  console.log('🔥 Placing REAL order with TP/SL on exchange:', { exchange, symbol, params, settings });
  
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const side = params.side || 'Buy';
  const isLong = side === 'Buy';
  
  // Получаем текущую цену
  const currentPrice = await getCurrentPrice(exchange, apiKeys, symbol);
  console.log('🔥 Current price:', currentPrice);

  // Рассчитываем TP и SL цены
  let takeProfitPrice, stopLossPrice;
  
  if (isLong) {
    const tpPercent = settings.long_tp_offset_percent || 0.3;
    const slPercent = settings.long_stop_loss_percent || 2.0;
    
    takeProfitPrice = currentPrice * (1 + tpPercent / 100);
    stopLossPrice = currentPrice * (1 - slPercent / 100);
  } else {
    const tpPercent = settings.short_tp_offset_percent || 0.3;
    const slPercent = settings.short_stop_loss_percent || 2.0;
    
    takeProfitPrice = currentPrice * (1 - tpPercent / 100);
    stopLossPrice = currentPrice * (1 + slPercent / 100);
  }

  const timestamp = Date.now().toString();
  
  // РЕАЛЬНЫЙ ордер с TP/SL на бирже
  const orderParams = {
    category: 'linear',
    symbol: symbol,
    side: side,
    orderType: 'Market',
    qty: params.qty || '0.01',
    takeProfit: takeProfitPrice.toFixed(4),
    stopLoss: stopLossPrice.toFixed(4),
    timestamp: timestamp
  };

  const queryString = Object.entries(orderParams)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
    
  const signature = await createSignature(queryString, apiKeys.api_secret);
  
  const url = `https://api${apiKeys.is_testnet ? '-testnet' : ''}.bybit.com/v5/order/create`;
  
  console.log('🔥 Sending REAL order to Bybit:', url, orderParams);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderParams)
  });

  const result = await response.json();
  console.log('🔥 Bybit REAL order response:', result);

  if (result.retCode !== 0) {
    throw new Error(`Bybit API error: ${result.retMsg || 'Unknown error'}`);
  }

  return {
    orderId: result.result?.orderId,
    symbol: symbol,
    side: side,
    qty: orderParams.qty,
    takeProfit: takeProfitPrice,
    stopLoss: stopLossPrice,
    currentPrice: currentPrice,
    message: `РЕАЛЬНЫЙ ордер размещен на бирже ${exchange}! ID: ${result.result?.orderId}`,
    isReal: true,
    exchange: exchange
  };
}

async function placeRealTestOrder(exchange: string, apiKeys: any, symbol: string, params: any, settings: any) {
  console.log('🔥 Placing REAL TEST order on exchange (small amount):', { exchange, symbol });
  
  // Тестовый ордер = реальный ордер с минимальной суммой
  const testParams = {
    ...params,
    qty: '0.001', // Минимальная сумма для теста
    side: params.side || 'Buy'
  };
  
  return await placeRealOrderWithTPSL(exchange, apiKeys, symbol, testParams, settings);
}

async function getRealBalance(exchange: string, apiKeys: any) {
  console.log('🔥 Getting REAL balance from', exchange);
  
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const timestamp = Date.now().toString();
  const queryString = `accountType=UNIFIED&timestamp=${timestamp}`;
  const signature = await createSignature(queryString, apiKeys.api_secret);
  
  const url = `https://api${apiKeys.is_testnet ? '-testnet' : ''}.bybit.com/v5/account/wallet-balance?${queryString}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
    }
  });

  const result = await response.json();
  console.log('🔥 REAL Balance response:', result);

  if (result.retCode !== 0) {
    throw new Error(`Bybit API error: ${result.retMsg || 'Unknown error'}`);
  }

  return result.result;
}

async function getRealPositions(exchange: string, apiKeys: any) {
  console.log('🔥 Getting REAL positions from', exchange);
  
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const timestamp = Date.now().toString();
  const queryString = `category=linear&timestamp=${timestamp}`;
  const signature = await createSignature(queryString, apiKeys.api_secret);
  
  const url = `https://api${apiKeys.is_testnet ? '-testnet' : ''}.bybit.com/v5/position/list?${queryString}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
    }
  });

  const result = await response.json();
  console.log('🔥 REAL Positions response:', result);

  if (result.retCode !== 0) {
    throw new Error(`Bybit API error: ${result.retMsg || 'Unknown error'}`);
  }

  return result.result;
}

async function closeRealPositions(exchange: string, apiKeys: any, symbol: string) {
  console.log('🔥 Closing REAL positions for', symbol, 'on', exchange);
  
  const positions = await getRealPositions(exchange, apiKeys);
  const results = [];
  
  if (positions && positions.list) {
    for (const position of positions.list) {
      if (position.symbol === symbol && parseFloat(position.size) > 0) {
        try {
          const closeResult = await placeRealCloseOrder(exchange, apiKeys, position);
          results.push({ success: true, symbol: position.symbol, result: closeResult });
        } catch (error) {
          console.error(`🔥 Error closing REAL position ${position.symbol}:`, error);
          results.push({ success: false, symbol: position.symbol, error: error.message });
        }
      }
    }
  }
  
  return {
    results: results,
    message: `Закрыто ${results.length} реальных позиций на бирже ${exchange}`
  };
}

async function cancelRealOrders(exchange: string, apiKeys: any, symbol: string) {
  console.log('🔥 Canceling REAL orders for', symbol, 'on', exchange);
  
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const timestamp = Date.now().toString();
  const orderParams = {
    category: 'linear',
    symbol: symbol,
    timestamp: timestamp
  };

  const queryString = Object.entries(orderParams)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
    
  const signature = await createSignature(queryString, apiKeys.api_secret);
  
  const url = `https://api${apiKeys.is_testnet ? '-testnet' : ''}.bybit.com/v5/order/cancel-all`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderParams)
  });

  const result = await response.json();
  console.log('🔥 REAL Cancel orders response:', result);

  if (result.retCode !== 0) {
    throw new Error(`Bybit API error: ${result.retMsg || 'Unknown error'}`);
  }

  return {
    result: result.result,
    message: `Отменены все реальные ордера для ${symbol} на бирже ${exchange}`
  };
}

async function placeRealCloseOrder(exchange: string, apiKeys: any, position: any) {
  const timestamp = Date.now().toString();
  const orderParams = {
    category: 'linear',
    symbol: position.symbol,
    side: position.side === 'Buy' ? 'Sell' : 'Buy',
    orderType: 'Market',
    qty: position.size,
    timestamp: timestamp
  };

  const queryString = Object.entries(orderParams)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
    
  const signature = await createSignature(queryString, apiKeys.api_secret);
  
  const url = `https://api${apiKeys.is_testnet ? '-testnet' : ''}.bybit.com/v5/order/create`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderParams)
  });

  const result = await response.json();
  
  if (result.retCode !== 0) {
    throw new Error(`Bybit API error: ${result.retMsg || 'Unknown error'}`);
  }

  return result.result;
}

async function getCurrentPrice(exchange: string, apiKeys: any, symbol: string) {
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported`);
  }

  const url = `https://api${apiKeys.is_testnet ? '-testnet' : ''}.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`;
  
  const response = await fetch(url);
  const result = await response.json();
  
  if (result.retCode !== 0) {
    throw new Error(`Failed to get price: ${result.retMsg}`);
  }
  
  return parseFloat(result.result.list[0].lastPrice);
}

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
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}