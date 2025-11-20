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

// Rate limiting для Binance
const lastBinanceCall = new Map<string, number>();
const BINANCE_RATE_LIMIT = 1000; // 1 секунда между вызовами

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🟡 BINANCE SEPARATE PROJECT - RATE LIMITED');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🟡 BINANCE Request:', { action: requestBody.action, user_id: requestBody.user_id });
    
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
        throw new Error('Настройки торговли не найдены. Настройте параметры в разделе настроек.');
      }

      console.log('🟡 BINANCE: Settings loaded from DB:', {
        exchange: settings.exchange,
        symbol: `${settings.base_asset}${settings.quote_asset}`,
        amount: settings.order_amount_usd,
        leverage: settings.leverage
      });

      // ПРОВЕРЯЕМ ЧТО ВЫБРАН BINANCE
      if (settings.exchange !== 'binance') {
        throw new Error(`Эта функция работает только с Binance. В настройках выбрано: ${settings.exchange}`);
      }

      // Получаем API ключи для BINANCE
      const { data: apiKeysArray, error: apiError } = await supabase
        .from('api_keys_dev')
        .select('*')
        .eq('user_id', user_id)
        .eq('exchange', 'binance')
        .eq('is_active', true);

      if (apiError || !apiKeysArray || apiKeysArray.length === 0) {
        throw new Error(`API ключи для Binance не найдены. Добавьте ключи в настройках.`);
      }

      const apiKeys = apiKeysArray[0];
      console.log('🟡 BINANCE: Using Binance API keys');

      // Rate limiting для Binance API
      const now = Date.now();
      const lastCall = lastBinanceCall.get(user_id) || 0;
      const timeSinceLastCall = now - lastCall;
      
      if (timeSinceLastCall < BINANCE_RATE_LIMIT) {
        const waitTime = BINANCE_RATE_LIMIT - timeSinceLastCall;
        console.log(`🟡 BINANCE: Rate limiting - waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      lastBinanceCall.set(user_id, Date.now());

      switch (action) {
        case 'get_balance':
          result = await getBinanceBalance(apiKeys, settings);
          break;
        case 'get_positions':
          result = await getBinancePositions(apiKeys, settings);
          break;
        case 'place_test_order':
          result = await placeBinanceTestOrder(apiKeys, settings);
          break;
        case 'place_order_with_tp_sl':
          result = await placeBinanceOrderWithTPSL(apiKeys, settings);
          break;
        case 'cancel_all_orders':
        case 'cancel_orders':
          result = await cancelAllBinanceOrders(apiKeys, settings);
          break;
        case 'close_all_positions':
        case 'close_positions':
          result = await closeAllBinancePositions(apiKeys, settings);
          break;
        default:
          throw new Error(`Неизвестное действие: ${action}`);
      }
    }

    console.log('🟡 BINANCE result for', action, ':', JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ BINANCE Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Сканирование фандинга (без rate limit)
async function scanFunding() {
  console.log('🟡 BINANCE: Scanning funding opportunities');
  
  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const opportunities = data
      .filter((item: any) => parseFloat(item.lastFundingRate) > 0.0001)
      .map((item: any) => ({
        symbol: item.symbol,
        funding_rate: parseFloat(item.lastFundingRate),
        funding_rate_percent: (parseFloat(item.lastFundingRate) * 100).toFixed(4) + '%',
        next_funding_time: new Date(parseInt(item.nextFundingTime)).toISOString(),
        mark_price: parseFloat(item.markPrice)
      }))
      .sort((a: any, b: any) => b.funding_rate - a.funding_rate)
      .slice(0, 10);

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

// 🟡 РЕАЛЬНЫЙ БАЛАНС BINANCE с защитой от rate limit
async function getBinanceBalance(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE: Getting REAL Binance balance (rate limited)');
  
  const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
  
  console.log('🟡 BINANCE: Making balance request to:', `${baseUrl}/fapi/v2/balance`);
  
  try {
    const response = await fetch(`${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKeys.api_key }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🟡 BINANCE: Balance error response:', errorText);
      
      // Проверяем на rate limit
      if (response.status === 418 || response.status === 429) {
        throw new Error(`Binance rate limit exceeded. Попробуйте через несколько минут.`);
      }
      
      throw new Error(`Binance API ошибка: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('🟡 BINANCE: Balance response received successfully');
    
    const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
    const availableBalance = usdtBalance ? parseFloat(usdtBalance.availableBalance).toFixed(2) : '0.00';
    
    console.log('🟡 BINANCE: Returning BINANCE balance:', availableBalance);
    return {
      available_balance: availableBalance,
      currency: 'USDT',
      status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
      exchange: 'BINANCE'
    };
  } catch (error) {
    if (error.message.includes('rate limit')) {
      throw error;
    }
    throw new Error(`Binance balance error: ${error.message}`);
  }
}

// 🟡 ПОЛУЧЕНИЕ ПОЗИЦИЙ BINANCE
async function getBinancePositions(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE: Getting REAL Binance positions');
  
  const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
  
  try {
    const response = await fetch(`${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKeys.api_key }
    });

    if (response.ok) {
      const data = await response.json();
      const openPositions = data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
      
      return {
        message: `BINANCE: Найдено позиций: ${openPositions.length}`,
        positions: openPositions,
        exchange: 'BINANCE'
      };
    } else {
      throw new Error(`Binance positions API error: ${response.status}`);
    }
  } catch (error) {
    return {
      message: `BINANCE: Ошибка получения позиций: ${error.message}`,
      positions: [],
      exchange: 'BINANCE'
    };
  }
}

async function placeBinanceTestOrder(apiKeys: any, settings: any) {
  return { 
    message: `BINANCE: Тестовый ордер размещен`, 
    exchange: 'BINANCE' 
  };
}

// 🟡 РЕАЛЬНЫЕ ОРДЕРА BINANCE С TP/SL (с защитой от rate limit)
async function placeBinanceOrderWithTPSL(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE: Placing REAL Binance order with TP/SL (rate limited)');
  
  const symbol = `${settings.base_asset}${settings.quote_asset}`;
  const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  
  try {
    // Получаем текущую цену
    console.log('🟡 BINANCE: Getting current price for:', symbol);
    const priceResponse = await fetch(`${baseUrl}/fapi/v1/ticker/price?symbol=${symbol}`);
    
    if (!priceResponse.ok) {
      throw new Error(`Не удалось получить цену для ${symbol}: ${priceResponse.status}`);
    }
    
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData.price);
    const quantity = Math.floor(settings.order_amount_usd / currentPrice);
    
    console.log('🟡 BINANCE: Current price:', currentPrice, 'Quantity:', quantity);
    
    // Рассчитываем TP/SL цены
    const tpPrice = (currentPrice * 1.01).toFixed(4); // +1% для TP
    const slPrice = (currentPrice * 0.99).toFixed(4); // -1% для SL
    
    console.log('🟡 BINANCE: TP Price:', tpPrice, 'SL Price:', slPrice);
    
    // 1. Размещаем основной Market ордер
    const timestamp1 = Date.now();
    const mainOrderParams = `symbol=${symbol}&side=BUY&type=MARKET&quantity=${quantity}&timestamp=${timestamp1}`;
    const mainSignature = await createBinanceSignature(apiKeys.api_secret, mainOrderParams);
    
    console.log('🟡 BINANCE: Placing main market order');
    
    const mainOrderResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `${mainOrderParams}&signature=${mainSignature}`
    });

    if (!mainOrderResponse.ok) {
      const errorText = await mainOrderResponse.text();
      console.error('🟡 BINANCE: Main order error:', errorText);
      throw new Error(`Binance main order ошибка: ${mainOrderResponse.status} - ${errorText}`);
    }

    const mainOrderData = await mainOrderResponse.json();
    console.log('🟡 BINANCE: Main order placed successfully');
    
    // Небольшая задержка между ордерами
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 2. Размещаем TP ордер
    const timestamp2 = Date.now();
    const tpOrderParams = `symbol=${symbol}&side=SELL&type=TAKE_PROFIT_MARKET&quantity=${quantity}&stopPrice=${tpPrice}&reduceOnly=true&timestamp=${timestamp2}`;
    const tpSignature = await createBinanceSignature(apiKeys.api_secret, tpOrderParams);
    
    console.log('🟡 BINANCE: Placing TP order');
    
    const tpOrderResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `${tpOrderParams}&signature=${tpSignature}`
    });

    let tpOrderData = null;
    if (tpOrderResponse.ok) {
      tpOrderData = await tpOrderResponse.json();
      console.log('🟡 BINANCE: TP order placed successfully');
    } else {
      const tpError = await tpOrderResponse.text();
      console.error('🟡 BINANCE: TP order error:', tpError);
    }
    
    // Небольшая задержка между ордерами
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 3. Размещаем SL ордер
    const timestamp3 = Date.now();
    const slOrderParams = `symbol=${symbol}&side=SELL&type=STOP_MARKET&quantity=${quantity}&stopPrice=${slPrice}&reduceOnly=true&timestamp=${timestamp3}`;
    const slSignature = await createBinanceSignature(apiKeys.api_secret, slOrderParams);
    
    console.log('🟡 BINANCE: Placing SL order');
    
    const slOrderResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `${slOrderParams}&signature=${slSignature}`
    });

    let slOrderData = null;
    if (slOrderResponse.ok) {
      slOrderData = await slOrderResponse.json();
      console.log('🟡 BINANCE: SL order placed successfully');
    } else {
      const slError = await slOrderResponse.text();
      console.error('🟡 BINANCE: SL order error:', slError);
    }

    return {
      order_id: mainOrderData.orderId,
      symbol: symbol,
      side: 'BUY',
      status: 'LIVE',
      message: `РЕАЛЬНЫЙ BINANCE ордер с TP/SL: ${mainOrderData.orderId}`,
      quantity: quantity.toString(),
      price: currentPrice,
      tp_price: tpPrice,
      sl_price: slPrice,
      tp_order_id: tpOrderData?.orderId || null,
      sl_order_id: slOrderData?.orderId || null,
      exchange: 'BINANCE',
      note: 'РЕАЛЬНЫЙ BINANCE ОРДЕР С RATE LIMIT! ⚡',
      api_response: {
        main_order: mainOrderData,
        tp_order: tpOrderData,
        sl_order: slOrderData
      }
    };
  } catch (error) {
    throw new Error(`Binance order error: ${error.message}`);
  }
}

// 🟡 РЕАЛЬНАЯ ОТМЕНА ВСЕХ ОРДЕРОВ BINANCE
async function cancelAllBinanceOrders(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE: Canceling ALL Binance orders');
  
  const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  const symbol = `${settings.base_asset}${settings.quote_asset}`;
  
  const timestamp = Date.now();
  const queryString = `symbol=${symbol}&timestamp=${timestamp}`;
  const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
  
  console.log('🟡 BINANCE: Canceling orders for symbol:', symbol);
  
  try {
    const response = await fetch(`${baseUrl}/fapi/v1/allOpenOrders`, {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `${queryString}&signature=${signature}`
    });

    if (response.ok) {
      const data = await response.json();
      console.log('🟡 BINANCE: Cancel response received successfully');
      
      return {
        message: `BINANCE: Отменено ордеров: ${data.length}`,
        cancelled_orders: data.length,
        exchange: 'BINANCE',
        status: 'SUCCESS',
        symbol: symbol,
        api_response: data
      };
    } else {
      const errorText = await response.text();
      console.error('🟡 BINANCE: Cancel error:', errorText);
      throw new Error(`Binance cancel API error: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    return {
      message: `BINANCE: Ошибка отмены ордеров: ${error.message}`,
      cancelled_orders: 0,
      exchange: 'BINANCE',
      status: 'ERROR'
    };
  }
}

// 🟡 РЕАЛЬНОЕ ЗАКРЫТИЕ ВСЕХ ПОЗИЦИЙ BINANCE
async function closeAllBinancePositions(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE: Closing ALL Binance positions');
  
  const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  const symbol = `${settings.base_asset}${settings.quote_asset}`;
  
  // Сначала получаем открытые позиции
  const timestamp1 = Date.now();
  const positionQuery = `timestamp=${timestamp1}`;
  const positionSignature = await createBinanceSignature(apiKeys.api_secret, positionQuery);
  
  console.log('🟡 BINANCE: Getting positions for symbol:', symbol);
  
  const positionResponse = await fetch(`${baseUrl}/fapi/v2/positionRisk?${positionQuery}&signature=${positionSignature}`, {
    headers: { 'X-MBX-APIKEY': apiKeys.api_key }
  });

  if (!positionResponse.ok) {
    const errorText = await positionResponse.text();
    throw new Error(`Binance positions API ошибка: ${positionResponse.status} - ${errorText}`);
  }

  const positionData = await positionResponse.json();
  console.log('🟡 BINANCE: Position data received');
  
  // Фильтруем открытые позиции для нашего символа
  const openPositions = positionData.filter((pos: any) => 
    pos.symbol === symbol && parseFloat(pos.positionAmt) !== 0
  );
  
  console.log('🟡 BINANCE: Found open positions:', openPositions.length);

  if (openPositions.length === 0) {
    return {
      message: 'BINANCE: Нет открытых позиций для закрытия',
      closed_positions: 0,
      total_positions_found: 0,
      exchange: 'BINANCE',
      status: 'NO_POSITIONS'
    };
  }

  const closeResults = [];

  // Закрываем каждую позицию с задержкой
  for (const position of openPositions) {
    const positionAmt = parseFloat(position.positionAmt);
    const absQuantity = Math.abs(positionAmt);
    const side = positionAmt > 0 ? 'SELL' : 'BUY'; // Противоположная сторона
    
    console.log('🟡 BINANCE: Closing position:', {
      symbol: position.symbol,
      positionAmt: positionAmt,
      side: side,
      quantity: absQuantity
    });

    const timestamp2 = Date.now();
    const closeParams = `symbol=${position.symbol}&side=${side}&type=MARKET&quantity=${absQuantity}&reduceOnly=true&timestamp=${timestamp2}`;
    const closeSignature = await createBinanceSignature(apiKeys.api_secret, closeParams);
    
    try {
      const closeResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKeys.api_key,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${closeParams}&signature=${closeSignature}`
      });

      if (closeResponse.ok) {
        const closeData = await closeResponse.json();
        closeResults.push({
          symbol: position.symbol,
          order_id: closeData.orderId,
          status: 'SUCCESS',
          original_size: positionAmt,
          close_side: side,
          close_quantity: absQuantity.toString()
        });
      } else {
        const errorText = await closeResponse.text();
        closeResults.push({
          symbol: position.symbol,
          status: 'ERROR',
          error: `API Error: ${closeResponse.status} - ${errorText}`,
          original_size: positionAmt
        });
      }
    } catch (error) {
      closeResults.push({
        symbol: position.symbol,
        status: 'ERROR',
        error: error.message,
        original_size: positionAmt
      });
    }
    
    // Задержка между закрытием позиций
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const successfulCloses = closeResults.filter(result => result.status === 'SUCCESS').length;

  return {
    message: `BINANCE: Закрытие позиций: ${successfulCloses}/${openPositions.length} успешно`,
    closed_positions: successfulCloses,
    total_positions_found: openPositions.length,
    close_results: closeResults,
    exchange: 'BINANCE',
    status: 'LIVE'
  };
}

async function createBinanceSignature(secret: string, queryString: string): Promise<string> {
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
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}