import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface TradingRequest {
  action: 'get_balance' | 'get_positions' | 'place_test_order' | 'place_order_with_tp_sl' | 'cancel_all_orders' | 'cancel_orders' | 'close_all_positions' | 'close_positions' | 'scan_funding';
  user_id: string;
}

// Кеш для цен и защита от дублирования
const priceCache = new Map<string, { price: number, timestamp: number }>();
const orderLocks = new Map<string, number>(); // Защита от дублирования ордеров
const PRICE_CACHE_TTL = 30000; // 30 секунд
const ORDER_LOCK_TTL = 15000; // 15 секунд защита от дублирования

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🟡 BINANCE COMPLETE Function started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🟡 Request:', { action: requestBody.action, user_id: requestBody.user_id });
    
    const { action, user_id }: TradingRequest = requestBody;
    
    if (!user_id) {
      throw new Error('user_id is required');
    }

    // 🚨 ЗАЩИТА ОТ ДУБЛИРОВАНИЯ ОРДЕРОВ
    if (action === 'place_order_with_tp_sl') {
      const now = Date.now();
      const lastOrderTime = orderLocks.get(user_id);
      
      if (lastOrderTime && (now - lastOrderTime) < ORDER_LOCK_TTL) {
        console.log('🚨 DUPLICATE ORDER BLOCKED for user:', user_id);
        throw new Error(`Пожалуйста, подождите ${Math.ceil((ORDER_LOCK_TTL - (now - lastOrderTime)) / 1000)} секунд перед следующим ордером`);
      }
      
      orderLocks.set(user_id, now);
      console.log('🟡 Order lock set for user:', user_id);
    }

    let result;

    // Специальная обработка для scan_funding
    if (action === 'scan_funding') {
      result = await scanFunding();
    } else {
      // Получаем настройки пользователя
      const { data: settings, error: settingsError } = await supabase
        .from('trading_settings')
        .select('*')
        .eq('user_id', user_id)
        .single();

      if (settingsError || !settings) {
        throw new Error('Настройки торговли не найдены. Настройте параметры в разделе настроек.');
      }

      console.log('🟡 Settings loaded:', {
        exchange: settings.exchange,
        symbol: `${settings.base_asset}${settings.quote_asset}`,
        amount: settings.order_amount_usd,
        leverage: settings.leverage
      });

      // Получаем API ключи для выбранной биржи
      const { data: apiKeysArray, error: apiError } = await supabase
        .from('api_keys_dev')
        .select('*')
        .eq('user_id', user_id)
        .eq('exchange', settings.exchange)
        .eq('is_active', true);

      if (apiError || !apiKeysArray || apiKeysArray.length === 0) {
        throw new Error(`API ключи для ${settings.exchange} не найдены. Добавьте ключи в настройках.`);
      }

      const apiKeys = apiKeysArray[0];
      console.log('🟡 Using API keys for:', settings.exchange);

      switch (action) {
        case 'get_balance':
          result = await getBalance(apiKeys, settings);
          break;
        case 'get_positions':
          result = await getPositions(apiKeys, settings);
          break;
        case 'place_test_order':
          result = await placeTestOrder(apiKeys, settings);
          break;
        case 'place_order_with_tp_sl':
          result = await placeOrderWithTPSL(apiKeys, settings);
          break;
        case 'cancel_all_orders':
        case 'cancel_orders':
          result = await cancelAllOrders(apiKeys, settings);
          break;
        case 'close_all_positions':
        case 'close_positions':
          result = await closeAllPositions(apiKeys, settings);
          break;
        default:
          throw new Error(`Неизвестное действие: ${action}`);
      }
    }

    console.log('🟡 Final result:', JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ BINANCE COMPLETE Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Сканирование фандинга
async function scanFunding() {
  console.log('🟡 Scanning funding opportunities');
  
  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const opportunities = data
      .filter((item: any) => parseFloat(item.lastFundingRate) !== 0)
      .sort((a: any, b: any) => Math.abs(parseFloat(b.lastFundingRate)) - Math.abs(parseFloat(a.lastFundingRate)))
      .slice(0, 5)
      .map((item: any) => ({
        exchange: 'binance',
        symbol: item.symbol,
        funding_rate: parseFloat(item.lastFundingRate),
        next_funding_time: new Date(item.nextFundingTime).toISOString(),
        apy_estimate: parseFloat(item.lastFundingRate) * 365 * 3,
        status: 'active'
      }));

    return {
      message: 'BINANCE: Фандинг сканирование выполнено',
      opportunities: opportunities,
      new_opportunities: opportunities.length,
      status: 'LIVE',
      scan_time: new Date().toISOString()
    };

  } catch (error) {
    throw new Error(`Funding scan failed: ${error.message}`);
  }
}

// Получение баланса
async function getBalance(apiKeys: any, settings: any) {
  console.log('🟡 Getting balance for:', settings.exchange);
  
  if (apiKeys.exchange === 'binance') {
    console.log('🟡 Processing Binance balance request');
    
    const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
    
    const response = await fetch(`${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKeys.api_key }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Binance API ошибка: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
    
    return {
      available_balance: parseFloat(usdtBalance?.availableBalance || '0').toFixed(2),
      currency: 'USDT',
      status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
      exchange: 'BINANCE'
    };
  }
  
  // Другие биржи
  return {
    available_balance: '0.00',
    currency: 'USDT',
    status: 'NOT_IMPLEMENTED ⚠️',
    exchange: settings.exchange.toUpperCase()
  };
}

// Получение позиций
async function getPositions(apiKeys: any, settings: any) {
  if (apiKeys.exchange === 'binance') {
    console.log('🟡 Getting Binance positions');
    
    const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
    
    const response = await fetch(`${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKeys.api_key }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Binance positions API ошибка: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const openPositions = data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
    
    return {
      positions: openPositions,
      total_positions: openPositions.length,
      exchange: 'BINANCE',
      status: 'LIVE ✅'
    };
  }
  
  return {
    positions: [],
    total_positions: 0,
    exchange: settings.exchange.toUpperCase(),
    status: 'LIVE ✅'
  };
}

// Тестовый ордер
async function placeTestOrder(apiKeys: any, settings: any) {
  return {
    message: `BINANCE: Тестовый ордер на ${settings.exchange.toUpperCase()}`,
    exchange: settings.exchange.toUpperCase(),
    symbol: `${settings.base_asset}${settings.quote_asset}`,
    amount: settings.order_amount_usd,
    leverage: settings.leverage,
    status: 'TEST_MODE'
  };
}

// РЕАЛЬНОЕ размещение ордера с TP/SL для Binance
async function placeOrderWithTPSL(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE placeOrderWithTPSL started for exchange:', apiKeys.exchange);
  
  if (apiKeys.exchange === 'binance') {
    console.log('🟡 Processing Binance order with TP/SL');
    
    const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    // Получаем текущую цену
    const currentPrice = await getBinanceCurrentPrice(symbol, apiKeys.is_testnet);
    console.log('🟡 Current price:', currentPrice);
    
    // Рассчитываем количество
    const calculatedQuantity = Math.floor(settings.order_amount_usd / currentPrice);
    const quantity = calculatedQuantity.toString();
    
    console.log('🟡 Quantity calculation:', {
      orderAmountUsd: settings.order_amount_usd,
      currentPrice: currentPrice,
      calculatedQuantity: calculatedQuantity,
      finalQuantity: quantity
    });
    
    // Рассчитываем цены TP и SL
    const tpPrice = (currentPrice * (1 + settings.long_tp_offset_percent / 100)).toFixed(4);
    const slPrice = (currentPrice * (1 - settings.long_stop_loss_percent / 100)).toFixed(4);
    
    console.log('🟡 TP/SL prices:', { tpPrice, slPrice, currentPrice });
    
    const timestamp = Date.now();
    
    // 1. Размещаем основной Market ордер
    const mainOrderParams = new URLSearchParams({
      symbol: symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: quantity,
      timestamp: timestamp.toString()
    });
    
    const mainSignature = await createBinanceSignature(apiKeys.api_secret, mainOrderParams.toString());
    mainOrderParams.append('signature', mainSignature);
    
    console.log('🟡 Placing main Binance order');
    
    const mainResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: mainOrderParams.toString()
    });

    const mainData = await mainResponse.json();
    console.log('🟡 Main order response:', mainData);

    if (!mainResponse.ok || mainData.code) {
      throw new Error(`Binance main order error: ${mainData.msg || 'Unknown error'}`);
    }

    // 2. Размещаем TP ордер
    const tpTimestamp = Date.now();
    const tpOrderParams = new URLSearchParams({
      symbol: symbol,
      side: 'SELL',
      type: 'TAKE_PROFIT_MARKET',
      quantity: quantity,
      stopPrice: tpPrice,
      timeInForce: 'GTC',
      timestamp: tpTimestamp.toString()
    });
    
    const tpSignature = await createBinanceSignature(apiKeys.api_secret, tpOrderParams.toString());
    tpOrderParams.append('signature', tpSignature);
    
    console.log('🟡 Placing TP order');
    
    const tpResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tpOrderParams.toString()
    });

    const tpData = await tpResponse.json();
    console.log('🟡 TP order response:', tpData);

    // 3. Размещаем SL ордер
    const slTimestamp = Date.now();
    const slOrderParams = new URLSearchParams({
      symbol: symbol,
      side: 'SELL',
      type: 'STOP_MARKET',
      quantity: quantity,
      stopPrice: slPrice,
      timeInForce: 'GTC',
      timestamp: slTimestamp.toString()
    });
    
    const slSignature = await createBinanceSignature(apiKeys.api_secret, slOrderParams.toString());
    slOrderParams.append('signature', slSignature);
    
    console.log('🟡 Placing SL order');
    
    const slResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: slOrderParams.toString()
    });

    const slData = await slResponse.json();
    console.log('🟡 SL order response:', slData);

    return {
      order_id: mainData.orderId,
      symbol: symbol,
      side: "BUY",
      status: 'LIVE',
      message: `BINANCE ордер с TP/SL: ${mainData.orderId}`,
      quantity: quantity,
      price: currentPrice,
      tp_price: tpPrice,
      sl_price: slPrice,
      tp_order_id: tpData.orderId || 'TP_ERROR',
      sl_order_id: slData.orderId || 'SL_ERROR',
      exchange: 'BINANCE',
      note: 'РЕАЛЬНЫЙ BINANCE ОРДЕР! ⚡',
      raw_response: {
        main: mainData,
        tp: tpData,
        sl: slData
      }
    };
  }
  
  throw new Error(`Размещение ордеров для ${apiKeys.exchange} не реализовано`);
}

// Отмена ордеров
async function cancelAllOrders(apiKeys: any, settings: any) {
  if (apiKeys.exchange === 'binance') {
    console.log('🟡 Cancelling all Binance orders');
    
    const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    const timestamp = Date.now();
    const queryString = `symbol=${symbol}&timestamp=${timestamp}`;
    const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
    
    const response = await fetch(`${baseUrl}/fapi/v1/allOpenOrders?${queryString}&signature=${signature}`, {
      method: 'DELETE',
      headers: { 'X-MBX-APIKEY': apiKeys.api_key }
    });

    const data = await response.json();
    console.log('🟡 Cancel orders response:', data);

    return {
      message: `BINANCE: Отменено ордеров: ${data.length || 0}`,
      cancelled_orders: data.length || 0,
      exchange: 'BINANCE',
      orders: data
    };
  }
  
  return {
    message: `BINANCE: Отмена ордеров на ${settings.exchange.toUpperCase()}`,
    cancelled_orders: 0,
    exchange: settings.exchange.toUpperCase()
  };
}

// РЕАЛЬНОЕ закрытие позиций для Binance
async function closeAllPositions(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE closeAllPositions started for exchange:', apiKeys.exchange);
  
  if (apiKeys.exchange === 'binance') {
    console.log('🟡 Processing REAL Binance close positions');
    
    const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    // 1. Получаем открытые позиции
    const positions = await getBinancePositions(apiKeys, symbol);
    console.log('🟡 Found positions:', positions);
    
    if (positions.length === 0) {
      return {
        message: 'BINANCE: Нет открытых позиций для закрытия',
        closed_positions: 0,
        total_positions_found: 0,
        exchange: 'BINANCE',
        status: 'NO_POSITIONS'
      };
    }
    
    let closedPositions = 0;
    const closeResults = [];
    
    // 2. Закрываем каждую позицию
    for (const position of positions) {
      try {
        console.log('🟡 Closing position:', position);
        
        const positionAmt = parseFloat(position.positionAmt);
        if (positionAmt === 0) continue;
        
        // Определяем сторону для закрытия (противоположную)
        const closeSide = positionAmt > 0 ? 'SELL' : 'BUY';
        const closeQuantity = Math.abs(positionAmt).toString();
        
        const timestamp = Date.now();
        const closeOrderParams = new URLSearchParams({
          symbol: symbol,
          side: closeSide,
          type: 'MARKET',
          quantity: closeQuantity,
          reduceOnly: 'true',
          timestamp: timestamp.toString()
        });
        
        const signature = await createBinanceSignature(apiKeys.api_secret, closeOrderParams.toString());
        closeOrderParams.append('signature', signature);
        
        console.log('🟡 Close order params:', closeOrderParams.toString());
        
        const response = await fetch(`${baseUrl}/fapi/v1/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKeys.api_key,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: closeOrderParams.toString()
        });

        const data = await response.json();
        console.log('🟡 Close position response:', data);

        if (response.ok && !data.code) {
          closedPositions++;
          closeResults.push({
            symbol: symbol,
            order_id: data.orderId,
            status: 'SUCCESS',
            original_size: positionAmt,
            close_side: closeSide,
            close_quantity: closeQuantity
          });
          console.log('🟡 Position closed successfully:', data.orderId);
        } else {
          closeResults.push({
            symbol: symbol,
            status: 'ERROR',
            error: data.msg || 'Unknown error',
            original_size: positionAmt,
            close_side: closeSide
          });
          console.error('🟡 Close position error:', data.msg);
        }
        
        // Задержка между закрытиями
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (closeError) {
        console.error('🟡 Close position error:', closeError);
        closeResults.push({
          symbol: symbol,
          status: 'ERROR',
          error: closeError.message
        });
      }
    }
    
    return {
      message: `BINANCE: Закрытие позиций: ${closedPositions}/${positions.length} успешно`,
      closed_positions: closedPositions,
      total_positions_found: positions.length,
      close_results: closeResults,
      exchange: 'BINANCE',
      status: 'LIVE',
      symbol: symbol
    };
  }
  
  throw new Error(`Закрытие позиций для ${apiKeys.exchange} не реализовано`);
}

// Получение позиций Binance
async function getBinancePositions(apiKeys: any, symbol: string) {
  const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
  
  const response = await fetch(`${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
    headers: { 'X-MBX-APIKEY': apiKeys.api_key }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Binance positions API ошибка: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Фильтруем только открытые позиции для конкретного символа
  const openPositions = data.filter((pos: any) => 
    pos.symbol === symbol && parseFloat(pos.positionAmt) !== 0
  );
  
  return openPositions;
}

// Получение текущей цены Binance
async function getBinanceCurrentPrice(symbol: string, isTestnet: boolean) {
  const baseUrl = isTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  
  const response = await fetch(`${baseUrl}/fapi/v1/ticker/price?symbol=${symbol}`);
  
  if (!response.ok) {
    throw new Error(`Binance price API error: ${response.status}`);
  }
  
  const data = await response.json();
  return parseFloat(data.price);
}

// Подписи

// Binance подпись
async function createBinanceSignature(secret: string, queryString: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(queryString);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}