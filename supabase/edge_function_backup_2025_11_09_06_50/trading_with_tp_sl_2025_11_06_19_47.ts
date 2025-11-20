import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  console.log('=== TRADING WITH TP/SL ===');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, exchange, symbol, user_id, ...params } = await req.json();
    
    console.log('🔥 Trading operation:', { action, exchange, symbol, user_id, params });

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
      console.error('API keys not found:', apiKeyError);
      throw new Error(`API ключи для биржи ${exchange} не найдены. Добавьте их в разделе API Ключи.`);
    }

    // Получаем настройки торговли пользователя
    const { data: settingsData, error: settingsError } = await supabaseClient
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settingsData) {
      console.error('Trading settings not found:', settingsError);
      throw new Error('Настройки торговли не найдены. Настройте их в разделе Настройки.');
    }

    console.log('🔥 Found settings:', settingsData);

    let result;
    switch (action) {
      case 'get_balance':
        result = await getBalance(exchange, apiKeyData);
        break;
      case 'place_order_with_tp_sl':
        result = await placeOrderWithTPSL(exchange, apiKeyData, symbol, params, settingsData);
        break;
      case 'place_test_order':
        result = await placeTestOrder(exchange, apiKeyData, symbol, params, settingsData);
        break;
      case 'get_positions':
        result = await getPositions(exchange, apiKeyData);
        break;
      case 'close_positions':
        result = await closeAllPositions(exchange, apiKeyData, symbol);
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
    console.error('🔥 Trading Error:', error);
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

async function placeOrderWithTPSL(exchange: string, apiKeys: any, symbol: string, params: any, settings: any) {
  console.log('🔥 Placing order with TP/SL:', { exchange, symbol, params, settings });
  
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const side = params.side || 'Buy';
  const isLong = side === 'Buy';
  
  // Рассчитываем размер позиции с учетом плеча
  const orderAmountUSD = settings.order_amount_usd || 100;
  const leverage = settings.leverage || 10;
  const positionSize = orderAmountUSD * leverage;
  
  console.log('🔥 Position calculation:', {
    orderAmountUSD,
    leverage,
    positionSize,
    side
  });

  // Получаем текущую цену для расчета TP/SL
  const currentPrice = await getCurrentPrice(exchange, apiKeys, symbol);
  console.log('🔥 Current price:', currentPrice);

  // Рассчитываем TP и SL цены
  let takeProfitPrice, stopLossPrice;
  
  if (isLong) {
    // Для лонг позиций
    const tpPercent = settings.long_tp_offset_percent || 0.3;
    const slPercent = settings.long_stop_loss_percent || 2.0;
    
    takeProfitPrice = currentPrice * (1 + tpPercent / 100);
    stopLossPrice = currentPrice * (1 - slPercent / 100);
  } else {
    // Для шорт позиций
    const tpPercent = settings.short_tp_offset_percent || 0.3;
    const slPercent = settings.short_stop_loss_percent || 2.0;
    
    takeProfitPrice = currentPrice * (1 - tpPercent / 100);
    stopLossPrice = currentPrice * (1 + slPercent / 100);
  }

  console.log('🔥 TP/SL prices:', {
    currentPrice,
    takeProfitPrice,
    stopLossPrice,
    isLong
  });

  const timestamp = Date.now().toString();
  
  // Основной ордер с TP/SL
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
  console.log('🔥 Bybit order response:', result);

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
    positionSize: positionSize,
    message: `Ордер размещен с TP: ${takeProfitPrice.toFixed(4)}, SL: ${stopLossPrice.toFixed(4)}`
  };
}

async function placeTestOrder(exchange: string, apiKeys: any, symbol: string, params: any, settings: any) {
  console.log('🔥 Placing TEST order with TP/SL:', { symbol, params, settings });
  
  const side = params.side || 'Buy';
  const isLong = side === 'Buy';
  
  // Симулируем текущую цену
  const currentPrice = 50000 + Math.random() * 1000; // Симуляция цены
  
  // Рассчитываем TP и SL
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

  return {
    orderId: `TEST_${Date.now()}`,
    symbol: symbol,
    side: side,
    qty: params.qty || '0.01',
    takeProfit: takeProfitPrice,
    stopLoss: stopLossPrice,
    currentPrice: currentPrice,
    positionSize: (settings.order_amount_usd || 100) * (settings.leverage || 10),
    message: `ТЕСТОВЫЙ ордер: TP: ${takeProfitPrice.toFixed(4)}, SL: ${stopLossPrice.toFixed(4)}`,
    isTest: true
  };
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

async function getBalance(exchange: string, apiKeys: any) {
  console.log('🔥 Getting balance for', exchange);
  
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
  console.log('🔥 Balance response:', result);

  if (result.retCode !== 0) {
    throw new Error(`Bybit API error: ${result.retMsg || 'Unknown error'}`);
  }

  return result.result;
}

async function getPositions(exchange: string, apiKeys: any) {
  console.log('🔥 Getting positions for', exchange);
  
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
  console.log('🔥 Positions response:', result);

  if (result.retCode !== 0) {
    throw new Error(`Bybit API error: ${result.retMsg || 'Unknown error'}`);
  }

  return result.result;
}

async function closeAllPositions(exchange: string, apiKeys: any, symbol: string) {
  console.log('🔥 Closing all positions for', symbol);
  
  const positions = await getPositions(exchange, apiKeys);
  const results = [];
  
  if (positions && positions.list) {
    for (const position of positions.list) {
      if (position.symbol === symbol && parseFloat(position.size) > 0) {
        try {
          const closeResult = await placeCloseOrder(exchange, apiKeys, position);
          results.push({ success: true, symbol: position.symbol, result: closeResult });
        } catch (error) {
          console.error(`🔥 Error closing position ${position.symbol}:`, error);
          results.push({ success: false, symbol: position.symbol, error: error.message });
        }
      }
    }
  }
  
  return results;
}

async function placeCloseOrder(exchange: string, apiKeys: any, position: any) {
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