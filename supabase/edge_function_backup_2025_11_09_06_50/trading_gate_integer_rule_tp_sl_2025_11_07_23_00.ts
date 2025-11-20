import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface TradingRequest {
  action: 'get_balance' | 'get_positions' | 'place_test_order' | 'place_order_with_tp_sl' | 'cancel_all_orders' | 'cancel_orders' | 'close_all_positions' | 'close_positions';
  user_id: string;
}

// Кеш для цен и защита от дублирования
const priceCache = new Map<string, { price: number, timestamp: number }>();
const orderLocks = new Map<string, number>(); // Защита от дублирования ордеров
const rateLimitCache = new Map<string, number>(); // Защита от rate limiting
const PRICE_CACHE_TTL = 30000; // 30 секунд
const ORDER_LOCK_TTL = 15000; // 15 секунд защита от дублирования
const RATE_LIMIT_DELAY = 10000; // 10 секунд между запросами к Binance

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔥 GATE TP/SL WITH INTEGER RULE Function started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🔥 Request body:', requestBody);
    
    const { action, user_id }: TradingRequest = requestBody;
    
    console.log('🔥 Trading action:', action, 'for user:', user_id);

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // 🚨 ЗАЩИТА ОТ ДУБЛИРОВАНИЯ ОРДЕРОВ
    if (action === 'place_order_with_tp_sl') {
      const now = Date.now();
      const lastOrderTime = orderLocks.get(user_id);
      
      if (lastOrderTime && (now - lastOrderTime) < ORDER_LOCK_TTL) {
        console.log('🚨 DUPLICATE ORDER BLOCKED for user:', user_id, 'last order:', lastOrderTime, 'now:', now);
        throw new Error(`Пожалуйста, подождите ${Math.ceil((ORDER_LOCK_TTL - (now - lastOrderTime)) / 1000)} секунд перед следующим ордером`);
      }
      
      orderLocks.set(user_id, now);
      console.log('🔥 Order lock set for user:', user_id, 'at:', now);
    }

    // Получаем API ключи пользователя
    console.log('🔥 Fetching API keys for user:', user_id);
    const { data: apiKeys, error: apiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true);

    console.log('🔥 API Keys query result:', { apiKeys, apiError });
    
    if (apiError) {
      console.error('❌ API Keys error:', apiError);
      throw new Error(`API Keys database error: ${apiError.message}`);
    }
    
    if (!apiKeys || apiKeys.length === 0) {
      console.error('❌ No API keys found');
      throw new Error('API ключи не найдены или неактивны');
    }

    // Получаем настройки торговли
    console.log('🔥 Fetching trading settings for user:', user_id);
    const { data: settingsData, error: settingsError } = await supabase
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🔥 Settings query result:', { settingsData, settingsError });
    
    if (settingsError) {
      console.error('❌ Settings error:', settingsError);
      throw new Error(`Settings database error: ${settingsError.message}`);
    }
    
    if (!settingsData) {
      console.error('❌ No settings found');
      throw new Error('Настройки торговли не найдены');
    }

    // Находим API ключ для нужной биржи
    const apiKey = apiKeys.find(key => key.exchange === settingsData.exchange);
    if (!apiKey) {
      console.error('❌ No API key for exchange:', settingsData.exchange);
      throw new Error(`API ключ для биржи ${settingsData.exchange} не найден`);
    }

    console.log('🔥 Using exchange:', apiKey.exchange);

    let result;
    switch (action) {
      case 'get_balance':
        console.log('🔥 Executing get_balance');
        result = await getBalance(apiKey, settingsData);
        break;

      case 'get_positions':
        console.log('🔥 Executing get_positions');
        result = await getPositions(apiKey, settingsData);
        break;

      case 'place_test_order':
        console.log('🔥 Executing place_test_order');
        result = await placeTestOrder(apiKey, settingsData);
        break;

      case 'place_order_with_tp_sl':
        console.log('🔥 Executing place_order_with_tp_sl');
        result = await placeOrderWithTPSL(apiKey, settingsData);
        break;

      case 'cancel_all_orders':
      case 'cancel_orders':
        console.log('🔥 Executing cancel_orders');
        result = await cancelAllOrders(apiKey, settingsData);
        break;

      case 'close_all_positions':
      case 'close_positions':
        console.log('🔥 Executing close_positions');
        result = await closeAllPositions(apiKey, settingsData);
        break;

      default:
        throw new Error(`❌ Неизвестное действие: ${action}`);
    }

    console.log('🔥 Action result:', result);

    return new Response(JSON.stringify({
      success: true,
      data: result,
      exchange: apiKey.exchange.toUpperCase(),
      mode: 'LIVE'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('🔥 Trading error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error',
      errorName: error.name,
      stack: error.stack,
      mode: 'ERROR'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Функции для работы с API
async function getBalance(apiKey: any, settings: any) {
  try {
    console.log('🔥 getBalance started for exchange:', apiKey.exchange);
    
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 balance request');
      
      // ОФИЦИАЛЬНЫЕ БАЗОВЫЕ URL ПО ДОКУМЕНТАЦИИ
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      const url = '/futures/usdt/accounts';  // Только путь для подписи (как в официальном примере)
      const queryString = '';
      const payloadString = '';
      
      console.log('🔥 GATE.IO v4: Base URL:', baseUrl);
      console.log('🔥 GATE.IO v4: Prefix:', prefix);
      console.log('🔥 GATE.IO v4: URL path:', url);
      console.log('🔥 GATE.IO v4: Full URL:', baseUrl + prefix + url);
      
      // Создаем подпись по официальному примеру
      const { signature, timestamp } = await createCompleteGateSignature(apiKey.api_secret, 'GET', prefix + url, queryString, payloadString);
      
      const fullUrl = baseUrl + prefix + url;
      console.log('🔥 GATE.IO v4 balance request URL:', fullUrl);
      
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'KEY': apiKey.api_key,
          'SIGN': signature,
          'Timestamp': timestamp,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 GATE.IO v4 balance response status:', response.status);
      console.log('🔥 GATE.IO v4 balance response:', data);

      if (response.status !== 200) {
        throw new Error(`GATE.IO v4 API Error: ${data.message || 'Unknown error'} (Code: ${response.status})`);
      }

      const result = {
        exchange: 'GATE',
        total_balance: data.total || '0.00',
        available_balance: data.available || '0.00',
        currency: 'USDT',
        status: apiKey.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
        result: data,
        debug_url: fullUrl,
        api_version: 'GATE_V4_WITH_INTEGER_RULE_TP_SL',
        base_url: baseUrl,
        signature_format: 'COMPLETE_DOCUMENTATION_BASED'
      };
      
      console.log('🔥 GATE.IO v4 balance result:', result);
      return result;
    }

    throw new Error(`Получение баланса для ${apiKey.exchange} не поддерживается`);

  } catch (error: any) {
    console.error('🔥 Balance error:', error);
    throw new Error(`Ошибка получения баланса: ${error.message}`);
  }
}

async function placeOrderWithTPSL(apiKey: any, settings: any) {
  try {
    console.log('🔥 placeOrderWithTPSL started for exchange:', apiKey.exchange);
    
    // 🆕 ИСПРАВЛЕННАЯ GATE.IO API V4 С ПРАВИЛЬНЫМИ TP/SL ЧЕРЕЗ PRICE ORDERS
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 order WITH INTEGER RULE TP/SL PRICE ORDERS');
      
      const symbol = `${settings.base_asset}_${settings.quote_asset}`;
      
      // ОФИЦИАЛЬНЫЕ БАЗОВЫЕ URL ПО ДОКУМЕНТАЦИИ
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      
      console.log('🔥 GATE.IO v4 ORDER: Base URL:', baseUrl);
      console.log('🔥 GATE.IO v4 ORDER: Symbol:', symbol);
      
      // Получаем текущую цену
      const priceUrl = `/futures/usdt/tickers?contract=${symbol}`;
      const fullPriceUrl = baseUrl + prefix + priceUrl;
      console.log('🔥 GATE.IO v4 ORDER: Price URL:', fullPriceUrl);
      
      const priceResponse = await fetch(fullPriceUrl);
      const priceData = await priceResponse.json();
      
      console.log('🔥 GATE.IO v4 ORDER: Price response status:', priceResponse.status);
      console.log('🔥 GATE.IO v4 ORDER: Price data:', priceData);
      
      if (!priceData || priceData.length === 0) {
        throw new Error(`Не удалось получить цену для ${symbol} на GATE.IO v4`);
      }
      
      const currentPrice = parseFloat(priceData[0].last);
      console.log('🔥 GATE.IO v4 current price:', currentPrice);
      
      // Рассчитываем количество (Gate.io использует контракты)
      const calculatedQuantity = Math.floor(settings.order_amount_usd / currentPrice);
      const quantity = calculatedQuantity;
      
      // Рассчитываем цены TP/SL с правильным округлением
      const tpPriceNumber = currentPrice * (1 + settings.long_tp_offset_percent / 100);
      const slPriceNumber = currentPrice * (1 - settings.long_stop_loss_percent / 100);
      
      // Округляем до 4 знаков после запятой для Gate.io
      const tpPrice = tpPriceNumber.toFixed(4);
      const slPrice = slPriceNumber.toFixed(4);
      
      console.log('🔥 GATE.IO v4 order params:', { 
        symbol, 
        quantity, 
        currentPrice,
        tpPrice,
        slPrice
      });
      
      // 1. ОСНОВНОЙ ОРДЕР
      const orderData = {
        contract: symbol,
        size: quantity,
        price: "0", // Market order
        tif: "ioc",
        text: `t-${Date.now().toString().slice(-6)}` // Правильный text с t- префиксом
      };
      
      console.log('🔥 GATE.IO v4 MAIN order data:', orderData);
      
      const orderUrl = '/futures/usdt/orders';
      const payloadString = JSON.stringify(orderData);
      const { signature, timestamp } = await createCompleteGateSignature(apiKey.api_secret, 'POST', prefix + orderUrl, '', payloadString);
      
      const fullOrderUrl = baseUrl + prefix + orderUrl;
      console.log('🔥 GATE.IO v4 order request URL:', fullOrderUrl);
      
      const response = await fetch(fullOrderUrl, {
        method: 'POST',
        headers: {
          'KEY': apiKey.api_key,
          'SIGN': signature,
          'Timestamp': timestamp,
          'Content-Type': 'application/json'
        },
        body: payloadString
      });

      const data = await response.json();
      console.log('🔥 GATE.IO v4 order response status:', response.status);
      console.log('🔥 GATE.IO v4 order response:', data);

      if (response.status !== 201) {
        throw new Error(`GATE.IO v4 API Error: ${data.message || 'Unknown error'} (Code: ${response.status})`);
      }

      const orderId = data.id;
      console.log('🔥 GATE.IO v4 MAIN order created:', orderId);

      // 🔧 ПРАВИЛЬНЫЕ TP/SL ЧЕРЕЗ PRICE ORDERS API С INTEGER RULE
      let tpOrderId = null;
      let slOrderId = null;
      let tpStatus = 'NOT_SET';
      let slStatus = 'NOT_SET';
      let tpError = null;
      let slError = null;

      try {
        // 2. TAKE PROFIT PRICE ORDER (rule: 1 для >=)
        console.log('🔥 GATE.IO v4: Creating TP Price Order with rule 1 (>=)');
        
        const tpPriceOrderData = {
          initial: {
            contract: symbol,
            size: -quantity, // Отрицательный размер для закрытия лонга
            price: tpPrice,
            tif: "gtc"
          },
          trigger: {
            rule: 1, // 🔧 INTEGER ПРАВИЛО ДЛЯ TP (>=)
            trigger_price: tpPrice,
            price_type: 0 // 0 - latest deal price
          }
        };
        
        console.log('🔥 GATE.IO v4 TP Price Order data:', tpPriceOrderData);
        
        const tpPayload = JSON.stringify(tpPriceOrderData);
        const { signature: tpSig, timestamp: tpTs } = await createCompleteGateSignature(apiKey.api_secret, 'POST', prefix + '/futures/usdt/price_orders', '', tpPayload);
        
        const tpPriceResponse = await fetch(baseUrl + prefix + '/futures/usdt/price_orders', {
          method: 'POST',
          headers: {
            'KEY': apiKey.api_key,
            'SIGN': tpSig,
            'Timestamp': tpTs,
            'Content-Type': 'application/json'
          },
          body: tpPayload
        });

        const tpPriceData = await tpPriceResponse.json();
        console.log('🔥 GATE.IO v4 TP Price Order response status:', tpPriceResponse.status);
        console.log('🔥 GATE.IO v4 TP Price Order response:', tpPriceData);

        if (tpPriceResponse.status === 201) {
          tpOrderId = tpPriceData.id;
          tpStatus = 'SUCCESS';
          console.log('🔥 GATE.IO v4 TP Price Order created:', tpOrderId);
        } else {
          tpStatus = 'ERROR';
          tpError = tpPriceData.message || 'Unknown TP error';
          console.error('🔥 GATE.IO v4 TP Price Order error:', tpError);
        }

        // Задержка между TP и SL
        await delay(1000);

        // 3. STOP LOSS PRICE ORDER (rule: 2 для <=)
        console.log('🔥 GATE.IO v4: Creating SL Price Order with rule 2 (<=)');
        
        const slPriceOrderData = {
          initial: {
            contract: symbol,
            size: -quantity, // Отрицательный размер для закрытия лонга
            price: slPrice,
            tif: "gtc"
          },
          trigger: {
            rule: 2, // 🔧 INTEGER ПРАВИЛО ДЛЯ SL (<=)
            trigger_price: slPrice,
            price_type: 0 // 0 - latest deal price
          }
        };
        
        console.log('🔥 GATE.IO v4 SL Price Order data:', slPriceOrderData);
        
        const slPayload = JSON.stringify(slPriceOrderData);
        const { signature: slSig, timestamp: slTs } = await createCompleteGateSignature(apiKey.api_secret, 'POST', prefix + '/futures/usdt/price_orders', '', slPayload);
        
        const slPriceResponse = await fetch(baseUrl + prefix + '/futures/usdt/price_orders', {
          method: 'POST',
          headers: {
            'KEY': apiKey.api_key,
            'SIGN': slSig,
            'Timestamp': slTs,
            'Content-Type': 'application/json'
          },
          body: slPayload
        });

        const slPriceData = await slPriceResponse.json();
        console.log('🔥 GATE.IO v4 SL Price Order response status:', slPriceResponse.status);
        console.log('🔥 GATE.IO v4 SL Price Order response:', slPriceData);

        if (slPriceResponse.status === 201) {
          slOrderId = slPriceData.id;
          slStatus = 'SUCCESS';
          console.log('🔥 GATE.IO v4 SL Price Order created:', slOrderId);
        } else {
          slStatus = 'ERROR';
          slError = slPriceData.message || 'Unknown SL error';
          console.error('🔥 GATE.IO v4 SL Price Order error:', slError);
        }

      } catch (priceOrderError) {
        console.error('🔥 GATE.IO v4 Price Orders error:', priceOrderError);
        tpStatus = 'ERROR';
        slStatus = 'ERROR';
        tpError = priceOrderError.message;
        slError = priceOrderError.message;
      }

      return {
        order_id: orderId,
        tp_order_id: tpOrderId,
        sl_order_id: slOrderId,
        symbol: symbol,
        side: "long",
        status: 'LIVE',
        message: `Боевой ордер GATE.IO v4 с INTEGER rule TP/SL: ${orderId}`,
        quantity: quantity,
        price: currentPrice,
        tp_price: tpPrice,
        sl_price: slPrice,
        tp_status: tpStatus,
        sl_status: slStatus,
        tp_error: tpError,
        sl_error: slError,
        exchange: 'GATE',
        api_url: 'gateio.ws',
        debug_url: fullOrderUrl,
        api_version: 'GATE_V4_WITH_INTEGER_RULE_PRICE_ORDERS',
        base_url: baseUrl,
        signature_format: 'COMPLETE_DOCUMENTATION_BASED',
        text_field_fix: 'CORRECT_T_PREFIX_APPLIED',
        tp_sl_implementation: 'PRICE_ORDERS_API_WITH_INTEGER_RULE_FIELD',
        tp_rule: 1, // Integer для >=
        sl_rule: 2, // Integer для <=
        price_type: 0, // 0 - latest deal price
        note: 'TP/SL установлены через Price Orders API с INTEGER rule полями'
      };
    }

    throw new Error(`Размещение ордеров для ${apiKey.exchange} не поддерживается`);

  } catch (error: any) {
    console.error('🔥 Set TP/SL error:', error);
    throw error;
  }
}

async function getPositions(apiKey: any, settings: any) {
  try {
    console.log('🔥 getPositions started for exchange:', apiKey.exchange);
    
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 positions request');
      
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      const url = '/futures/usdt/positions';
      const queryString = '';
      const payloadString = '';
      
      console.log('🔥 GATE.IO v4 positions URL:', baseUrl + prefix + url);
      
      const { signature, timestamp } = await createCompleteGateSignature(apiKey.api_secret, 'GET', prefix + url, queryString, payloadString);
      
      const response = await fetch(baseUrl + prefix + url, {
        method: 'GET',
        headers: {
          'KEY': apiKey.api_key,
          'SIGN': signature,
          'Timestamp': timestamp,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 GATE.IO v4 positions response status:', response.status);
      console.log('🔥 GATE.IO v4 positions response:', data);

      if (response.status !== 200) {
        throw new Error(`GATE.IO v4 Positions API Error: ${data.message || 'Unknown error'} (Code: ${response.status})`);
      }

      // Фильтруем только открытые позиции
      const openPositions = data.filter((position: any) => parseFloat(position.size) !== 0);
      
      console.log('🔥 GATE.IO v4 open positions:', openPositions);
      return openPositions;
    }
    
    throw new Error(`Получение позиций для ${apiKey.exchange} не поддерживается`);

  } catch (error: any) {
    console.error('🔥 Positions error:', error);
    throw new Error(`Ошибка получения позиций: ${error.message}`);
  }
}

async function cancelAllOrders(apiKey: any, settings: any) {
  try {
    console.log('🔥 cancelAllOrders started for exchange:', apiKey.exchange);
    
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 cancel orders request');
      
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      const symbol = `${settings.base_asset}_${settings.quote_asset}`;
      
      let totalCancelled = 0;
      const cancelResults = [];

      // 🔧 ИСПРАВЛЕНО: ОТМЕНА ВСЕХ ТИПОВ ОРДЕРОВ ДЛЯ GATE.IO
      
      // 1. ОТМЕНА ОБЫЧНЫХ ОРДЕРОВ
      try {
        const ordersUrl = `/futures/usdt/orders?contract=${symbol}&status=open`;
        const { signature: ordersSig, timestamp: ordersTs } = await createCompleteGateSignature(apiKey.api_secret, 'DELETE', prefix + ordersUrl, '', '');
        
        console.log('🔥 GATE.IO v4 cancel regular orders URL:', baseUrl + prefix + ordersUrl);
        
        const ordersResponse = await fetch(baseUrl + prefix + ordersUrl, {
          method: 'DELETE',
          headers: {
            'KEY': apiKey.api_key,
            'SIGN': ordersSig,
            'Timestamp': ordersTs,
            'Content-Type': 'application/json'
          }
        });

        const ordersData = await ordersResponse.json();
        console.log('🔥 GATE.IO v4 cancel regular orders response status:', ordersResponse.status);
        console.log('🔥 GATE.IO v4 cancel regular orders response:', ordersData);

        if (ordersResponse.status === 200 && Array.isArray(ordersData)) {
          totalCancelled += ordersData.length;
          cancelResults.push({
            type: 'REGULAR_ORDERS',
            cancelled: ordersData.length,
            status: 'SUCCESS'
          });
        } else {
          cancelResults.push({
            type: 'REGULAR_ORDERS',
            cancelled: 0,
            status: 'ERROR',
            error: ordersData.message || 'Unknown error'
          });
        }
      } catch (regularError) {
        console.error('🔥 GATE.IO v4 regular orders cancel error:', regularError);
        cancelResults.push({
          type: 'REGULAR_ORDERS',
          cancelled: 0,
          status: 'ERROR',
          error: regularError.message
        });
      }

      // 2. ОТМЕНА УСЛОВНЫХ ОРДЕРОВ (PRICE ORDERS) - TP/SL
      try {
        const priceOrdersUrl = `/futures/usdt/price_orders?contract=${symbol}&status=open`;
        const { signature: priceSig, timestamp: priceTs } = await createCompleteGateSignature(apiKey.api_secret, 'DELETE', prefix + priceOrdersUrl, '', '');
        
        console.log('🔥 GATE.IO v4 cancel price orders URL:', baseUrl + prefix + priceOrdersUrl);
        
        const priceResponse = await fetch(baseUrl + prefix + priceOrdersUrl, {
          method: 'DELETE',
          headers: {
            'KEY': apiKey.api_key,
            'SIGN': priceSig,
            'Timestamp': priceTs,
            'Content-Type': 'application/json'
          }
        });

        const priceData = await priceResponse.json();
        console.log('🔥 GATE.IO v4 cancel price orders response status:', priceResponse.status);
        console.log('🔥 GATE.IO v4 cancel price orders response:', priceData);

        if (priceResponse.status === 200 && Array.isArray(priceData)) {
          totalCancelled += priceData.length;
          cancelResults.push({
            type: 'PRICE_ORDERS_TP_SL',
            cancelled: priceData.length,
            status: 'SUCCESS'
          });
        } else {
          cancelResults.push({
            type: 'PRICE_ORDERS_TP_SL',
            cancelled: 0,
            status: 'ERROR',
            error: priceData.message || 'Unknown error'
          });
        }
      } catch (priceError) {
        console.error('🔥 GATE.IO v4 price orders cancel error:', priceError);
        cancelResults.push({
          type: 'PRICE_ORDERS_TP_SL',
          cancelled: 0,
          status: 'ERROR',
          error: priceError.message
        });
      }

      return {
        cancelled_orders: totalCancelled,
        cancel_results: cancelResults,
        exchange: 'GATE',
        status: 'LIVE',
        message: `Отмена ордеров GATE.IO v4: ${totalCancelled} ордеров отменено`,
        api_version: 'GATE_V4_ALL_ORDER_TYPES',
        symbol: symbol,
        cancel_types: 'REGULAR_AND_PRICE_ORDERS_COMPREHENSIVE'
      };
    }
    
    throw new Error(`Отмена ордеров для ${apiKey.exchange} не поддерживается`);

  } catch (error: any) {
    console.error('🔥 Cancel orders error:', error);
    throw new Error(`Ошибка отмены ордеров: ${error.message}`);
  }
}

async function closeAllPositions(apiKey: any, settings: any) {
  try {
    console.log('🔥 closeAllPositions started for exchange:', apiKey.exchange);
    
    // 🆕 GATE.IO ЗАКРЫТИЕ ПОЗИЦИЙ
    if (apiKey.exchange === 'gate') {
      console.log('🔥 Processing GATE.IO API v4 close positions request');
      
      const GATE_API_BASE = 'https://api.gateio.ws';
      const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
      
      const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
      const prefix = '/api/v4';
      const symbol = `${settings.base_asset}_${settings.quote_asset}`;
      
      // 1. Получаем открытые позиции
      const positionsUrl = '/futures/usdt/positions';
      const { signature: posSig, timestamp: posTs } = await createCompleteGateSignature(apiKey.api_secret, 'GET', prefix + positionsUrl, '', '');
      
      console.log('🔥 GATE.IO v4 get positions URL:', baseUrl + prefix + positionsUrl);
      
      const positionsResponse = await fetch(baseUrl + prefix + positionsUrl, {
        method: 'GET',
        headers: {
          'KEY': apiKey.api_key,
          'SIGN': posSig,
          'Timestamp': posTs,
          'Content-Type': 'application/json'
        }
      });

      const positionsData = await positionsResponse.json();
      console.log('🔥 GATE.IO v4 positions response status:', positionsResponse.status);
      console.log('🔥 GATE.IO v4 positions response:', positionsData);

      if (positionsResponse.status !== 200) {
        throw new Error(`GATE.IO v4 Positions API Error: ${positionsData.message || 'Unknown error'} (Code: ${positionsResponse.status})`);
      }

      // Фильтруем открытые позиции для нашего символа
      const openPositions = positionsData.filter((position: any) => 
        position.contract === symbol && parseFloat(position.size) !== 0
      );

      console.log('🔥 GATE.IO v4 open positions for', symbol, ':', openPositions);

      if (openPositions.length === 0) {
        return {
          closed_positions: 0,
          exchange: 'GATE',
          status: 'LIVE',
          message: `Нет открытых позиций для закрытия по ${symbol}`,
          api_version: 'GATE_V4',
          symbol: symbol
        };
      }

      // 2. ЗАКРЫТИЕ ПОЗИЦИЙ ЧЕРЕЗ MARKET ОРДЕРА
      let closedPositions = 0;
      const closeResults = [];

      for (const position of openPositions) {
        try {
          const positionSize = parseFloat(position.size);
          
          console.log('🔥 GATE.IO v4 closing position:', { 
            contract: position.contract, 
            originalSize: positionSize,
            positionType: positionSize > 0 ? 'LONG' : 'SHORT'
          });

          // MARKET ОРДЕР ДЛЯ ЗАКРЫТИЯ
          const closeOrderData = {
            contract: position.contract,
            size: -positionSize, // Противоположный размер для закрытия
            price: "0", // Market order
            tif: "ioc",
            text: `t-${Date.now().toString().slice(-6)}`, // Правильный text с t- префиксом
            reduce_only: true // Важно: только для закрытия позиции
          };

          console.log('🔥 GATE.IO v4 close order data:', closeOrderData);

          const closePayload = JSON.stringify(closeOrderData);
          const { signature: closeSig, timestamp: closeTs } = await createCompleteGateSignature(apiKey.api_secret, 'POST', prefix + '/futures/usdt/orders', '', closePayload);

          const closeResponse = await fetch(baseUrl + prefix + '/futures/usdt/orders', {
            method: 'POST',
            headers: {
              'KEY': apiKey.api_key,
              'SIGN': closeSig,
              'Timestamp': closeTs,
              'Content-Type': 'application/json'
            },
            body: closePayload
          });

          const closeData = await closeResponse.json();
          console.log('🔥 GATE.IO v4 close order response status:', closeResponse.status);
          console.log('🔥 GATE.IO v4 close order response:', closeData);

          if (closeResponse.status === 201) {
            closedPositions++;
            closeResults.push({
              contract: position.contract,
              order_id: closeData.id,
              status: 'SUCCESS',
              original_size: positionSize,
              close_size: -positionSize,
              position_type: positionSize > 0 ? 'LONG' : 'SHORT',
              close_method: 'MARKET_ORDER_WITH_REDUCE_ONLY'
            });
            console.log('🔥 GATE.IO v4 position closed successfully');
          } else {
            closeResults.push({
              contract: position.contract,
              status: 'ERROR',
              error: closeData.message || 'Unknown error',
              original_size: positionSize,
              close_method: 'MARKET_ORDER_WITH_REDUCE_ONLY'
            });
            console.error('🔥 GATE.IO v4 close order error:', closeData.message);
          }

          // Задержка между закрытиями позиций
          await delay(1000);

        } catch (closeError) {
          console.error('🔥 GATE.IO v4 close position error:', closeError);
          closeResults.push({
            contract: position.contract,
            status: 'ERROR',
            error: closeError.message
          });
        }
      }

      return {
        closed_positions: closedPositions,
        total_positions_found: openPositions.length,
        close_results: closeResults,
        exchange: 'GATE',
        status: 'LIVE',
        message: `Закрытие позиций GATE.IO v4: ${closedPositions}/${openPositions.length} успешно`,
        api_version: 'GATE_V4',
        symbol: symbol,
        close_method: 'MARKET_ORDER_WITH_REDUCE_ONLY',
        api_endpoint: '/futures/usdt/orders'
      };
    }
    
    throw new Error(`Закрытие позиций для ${apiKey.exchange} не поддерживается`);

  } catch (error: any) {
    console.error('🔥 Close positions error:', error);
    throw new Error(`Ошибка закрытия позиций: ${error.message}`);
  }
}

async function placeTestOrder(apiKey: any, settings: any) {
  return { order_id: 'TEST_123', status: 'MOCK' };
}

// 🆕 ФУНКЦИЯ СОЗДАНИЯ ПОДПИСИ ДЛЯ GATE.IO API V4
async function createCompleteGateSignature(secret: string, method: string, url: string, queryString: string = '', payloadString: string = ''): Promise<{ signature: string, timestamp: string }> {
  try {
    // Используем текущее время в секундах (как в официальном примере)
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    console.log('🔥 GATE.IO v4 signature inputs:');
    console.log('  Method:', method);
    console.log('  URL (path only):', url);
    console.log('  Query String:', queryString);
    console.log('  Payload String:', payloadString);
    console.log('  Timestamp:', timestamp);
    
    // Создаем SHA-512 хеш тела запроса (как в официальном примере Python)
    const payloadHash = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(payloadString));
    const hashedPayload = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('🔥 GATE.IO v4 hashed payload:', hashedPayload);
    
    // ОФИЦИАЛЬНЫЙ ФОРМАТ СТРОКИ ПОДПИСИ ПО ДОКУМЕНТАЦИИ:
    // method + '\n' + url + '\n' + query_string + '\n' + hashed_payload + '\n' + timestamp
    const signatureString = `${method}\n${url}\n${queryString}\n${hashedPayload}\n${timestamp}`;
    
    console.log('🔥 GATE.IO v4 signature string:');
    console.log(signatureString);
    
    // Создаем HMAC-SHA512 подпись (как в официальном примере)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(signatureString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('🔥 GATE.IO v4 signature result:', result);
    return { signature: result, timestamp };
  } catch (error) {
    console.error('❌ Error creating GATE.IO v4 signature:', error);
    throw error;
  }
}

// Функция задержки для rate limiting
async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}