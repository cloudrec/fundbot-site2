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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, user_id }: TradingRequest = await req.json();
    
    console.log('🔥 Trading action:', action, 'for user:', user_id);
    console.log('🔥 Request body:', { action, user_id });

    // Получаем API ключи пользователя
    const { data: apiKeys, error: apiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true);

    console.log('🔥 API Keys query result:', { apiKeys, apiError });
    
    if (apiError || !apiKeys || apiKeys.length === 0) {
      console.error('❌ API Keys error:', apiError);
      throw new Error('АPI ключи не найдены или неактивны');
    }

    // Получаем настройки торговли
    const { data: settingsData, error: settingsError } = await supabase
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🔥 Settings query result:', { settingsData, settingsError });
    
    if (settingsError || !settingsData) {
      console.error('❌ Settings error:', settingsError);
      throw new Error('Настройки торговли не найдены');
    }

    // Находим API ключ для нужной биржи
    const apiKey = apiKeys.find(key => key.exchange === settingsData.exchange);
    if (!apiKey) {
      throw new Error(`API ключ для биржи ${settingsData.exchange} не найден`);
    }

    console.log('🔥 Using exchange:', apiKey.exchange);

    let result;
    switch (action) {
      case 'get_balance':
        result = await getBalance(apiKey, settingsData);
        break;

      case 'get_positions':
        result = await getPositions(apiKey, settingsData);
        break;

      case 'place_test_order':
        result = await placeTestOrder(apiKey, settingsData);
        break;

      case 'place_order_with_tp_sl':
        result = await placeOrderWithTPSL(apiKey, settingsData);
        break;

      case 'cancel_all_orders':
      case 'cancel_orders':
        result = await cancelAllOrders(apiKey, settingsData);
        break;

      case 'close_all_positions':
      case 'close_positions':
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
    console.error('🔥 Error stack:', error.stack);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error',
      stack: error.stack,
      mode: 'ERROR'
    }), {
      status: 200, // Изменяем на 200 чтобы увидеть ошибку
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Функция создания подписи для Binance
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
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Функции для работы с API
async function getBalance(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange === 'binance') {
      // Реальная поддержка Binance API
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = await createBinanceSignature(apiKey.api_secret, queryString);
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const url = `${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`;
      
      console.log('🔥 Binance balance request URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 Binance balance response:', data);

      if (response.status !== 200) {
        throw new Error(`Binance API Error: ${data.msg || 'Unknown error'} (Code: ${data.code || response.status})`);
      }

      const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
      
      return {
        exchange: 'BINANCE',
        total_balance: usdtBalance?.balance || '0.00',
        available_balance: usdtBalance?.availableBalance || '0.00',
        currency: 'USDT',
        status: apiKey.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
        result: {
          list: data.map((balance: any) => ({
            coin: balance.asset,
            walletBalance: balance.balance,
            availableBalance: balance.availableBalance
          }))
        }
      };
    }
    
    // Поддержка Bybit
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Получение баланса для ${apiKey.exchange} пока не поддерживается`);
    }

    const timestamp = Date.now().toString();
    const params = `accountType=UNIFIED&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/account/wallet-balance?${params}`;
    
    console.log('🔥 Balance request URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('🔥 Bybit balance response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }

    const usdtBalance = data.result?.list?.[0]?.coin?.find((c: any) => c.coin === 'USDT');
    
    return {
      exchange: "BYBIT",
      total_balance: usdtBalance?.walletBalance || "0.00",
      available_balance: usdtBalance?.availableToWithdraw || "0.00",
      currency: "USDT",
      status: apiKey.is_testnet ? "TESTNET ⚠️" : "LIVE ✅"
    };

  } catch (error: any) {
    console.error('🔥 Balance error:', error);
    throw new Error(`Ошибка получения баланса: ${error.message}`);
  }
}

async function getPositions(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange === 'binance') {
      // Реальная поддержка Binance - получаем реальные позиции
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = await createBinanceSignature(apiKey.api_secret, queryString);
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const url = `${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`;
      
      console.log('🔥 Binance positions request URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('🔥 Binance positions response:', data);

      if (response.status !== 200) {
        throw new Error(`Binance API Error: ${data.msg || 'Unknown error'} (Code: ${data.code || response.status})`);
      }

      // Фильтруем только открытые позиции
      return data.filter((position: any) => parseFloat(position.positionAmt) !== 0);
    }
    
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Получение позиций для ${apiKey.exchange} пока не поддерживается`);
    }

    const timestamp = Date.now().toString();
    const params = `category=linear&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/position/list?${params}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('🔥 Positions response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }

    return data.result?.list || [];

  } catch (error: any) {
    console.error('🔥 Positions error:', error);
    throw new Error(`Ошибка получения позиций: ${error.message}`);
  }
}

async function placeTestOrder(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange === 'binance') {
      // Реальные ордера Binance - размещаем боевой ордер
      const timestamp = Date.now();
      const symbol = `${settings.base_asset}${settings.quote_asset}`;
      const side = 'BUY'; // или 'SELL' в зависимости от логики
      const type = 'MARKET';
      const quantity = (settings.order_amount_usd / 50000).toFixed(6); // Примерное количество
      
      const queryString = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;
      const signature = await createBinanceSignature(apiKey.api_secret, queryString);
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const url = `${baseUrl}/fapi/v1/order`;
      
      console.log('🔥 Binance order request:', { symbol, side, type, quantity });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${queryString}&signature=${signature}`
      });

      const data = await response.json();
      console.log('🔥 Binance order response:', data);

      if (response.status !== 200) {
        throw new Error(`Binance API Error: ${data.msg || 'Unknown error'} (Code: ${data.code || response.status})`);
      }

      return {
        order_id: data.orderId,
        symbol: data.symbol,
        side: data.side,
        status: 'LIVE',
        message: `Боевой ордер Binance размещен: ${data.orderId}`
      };
    }
    
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Размещение ордеров для ${apiKey.exchange} пока не поддерживается`);
    }

    // Bybit код остается прежним
    const timestamp = Date.now();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    const orderData = {
      category: "linear",
      symbol: symbol,
      side: "Buy",
      orderType: "Market",
      qty: (settings.order_amount_usd / 50000).toString(),
      timeInForce: "IOC"
    };

    const body = JSON.stringify(orderData);
    const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, body);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/order/create`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'Content-Type': 'application/json'
      },
      body: body
    });

    const data = await response.json();
    console.log('🔥 Test order response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }

    return {
      order_id: data.result?.orderId,
      symbol: symbol,
      side: "Buy",
      status: apiKey.is_testnet ? "TESTNET" : "LIVE",
      message: `Ордер размещен на ${apiKey.exchange.toUpperCase()}`
    };

  } catch (error: any) {
    console.error('🔥 Test order error:', error);
    throw new Error(`Ошибка размещения тестового ордера: ${error.message}`);
  }
}

async function placeOrderWithTPSL(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange === 'binance') {
      // Реальные ордера Binance с TP/SL - боевой режим
      const timestamp = Date.now();
      const symbol = `${settings.base_asset}${settings.quote_asset}`;
      const side = 'BUY';
      const type = 'MARKET';
      const quantity = (settings.order_amount_usd / 50000).toFixed(6);
      
      // 1. Размещаем основной ордер
      const mainOrderQuery = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;
      const mainOrderSignature = await createBinanceSignature(apiKey.api_secret, mainOrderQuery);
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      
      console.log('🔥 Binance main order request:', { symbol, side, type, quantity });
      
      const mainOrderResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${mainOrderQuery}&signature=${mainOrderSignature}`
      });

      const mainOrderData = await mainOrderResponse.json();
      console.log('🔥 Binance main order response:', mainOrderData);

      if (mainOrderResponse.status !== 200) {
        throw new Error(`Binance Main Order Error: ${mainOrderData.msg || 'Unknown error'} (Code: ${mainOrderData.code || mainOrderResponse.status})`);
      }

      // 2. Размещаем Take Profit ордер
      const tpPrice = (50000 * (1 + settings.long_tp_offset_percent / 100)).toFixed(2);
      const tpTimestamp = Date.now();
      const tpQuery = `symbol=${symbol}&side=SELL&type=TAKE_PROFIT_MARKET&quantity=${quantity}&stopPrice=${tpPrice}&timestamp=${tpTimestamp}`;
      const tpSignature = await createBinanceSignature(apiKey.api_secret, tpQuery);
      
      const tpResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${tpQuery}&signature=${tpSignature}`
      });

      const tpData = await tpResponse.json();
      console.log('🔥 Binance TP order response:', tpData);

      // 3. Размещаем Stop Loss ордер
      const slPrice = (50000 * (1 - settings.long_stop_loss_percent / 100)).toFixed(2);
      const slTimestamp = Date.now();
      const slQuery = `symbol=${symbol}&side=SELL&type=STOP_MARKET&quantity=${quantity}&stopPrice=${slPrice}&timestamp=${slTimestamp}`;
      const slSignature = await createBinanceSignature(apiKey.api_secret, slQuery);
      
      const slResponse = await fetch(`${baseUrl}/fapi/v1/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${slQuery}&signature=${slSignature}`
      });

      const slData = await slResponse.json();
      console.log('🔥 Binance SL order response:', slData);

      return {
        order_id: mainOrderData.orderId,
        symbol: mainOrderData.symbol,
        side: mainOrderData.side,
        status: 'LIVE',
        tp_order_id: tpData.orderId || 'TP_ERROR',
        sl_order_id: slData.orderId || 'SL_ERROR',
        message: `Боевой ордер Binance с TP/SL: ${mainOrderData.orderId}`
      };
    }
    
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Размещение ордеров для ${apiKey.exchange} пока не поддерживается`);
    }

    // Bybit код остается прежним...
    const timestamp = Date.now();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    const orderData = {
      category: "linear",
      symbol: symbol,
      side: "Buy",
      orderType: "Market",
      qty: (settings.order_amount_usd / 50000).toString(),
      timeInForce: "IOC",
      takeProfit: (50000 * (1 + settings.long_tp_offset_percent / 100)).toFixed(2),
      stopLoss: (50000 * (1 - settings.long_stop_loss_percent / 100)).toFixed(2)
    };

    const body = JSON.stringify(orderData);
    const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, body);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/order/create`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'Content-Type': 'application/json'
      },
      body: body
    });

    const data = await response.json();
    console.log('🔥 TP/SL order response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }

    return {
      order_id: data.result?.orderId,
      symbol: symbol,
      side: "Buy",
      status: apiKey.is_testnet ? "TESTNET" : "LIVE",
      tp_order_id: "TP_" + data.result?.orderId,
      sl_order_id: "SL_" + data.result?.orderId,
      message: `Ордер с TP/SL размещен на ${apiKey.exchange.toUpperCase()}`
    };

  } catch (error: any) {
    console.error('🔥 Set TP/SL error:', error);
    throw error;
  }
}

async function cancelAllOrders(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange === 'binance') {
      // Реальная отмена ордеров Binance
      const timestamp = Date.now();
      const symbol = `${settings.base_asset}${settings.quote_asset}`;
      const queryString = `symbol=${symbol}&timestamp=${timestamp}`;
      const signature = await createBinanceSignature(apiKey.api_secret, queryString);
      
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const url = `${baseUrl}/fapi/v1/allOpenOrders`;
      
      console.log('🔥 Binance cancel all orders request:', { symbol });
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'X-MBX-APIKEY': apiKey.api_key,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${queryString}&signature=${signature}`
      });

      const data = await response.json();
      console.log('🔥 Binance cancel orders response:', data);

      if (response.status !== 200) {
        throw new Error(`Binance API Error: ${data.msg || 'Unknown error'} (Code: ${data.code || response.status})`);
      }

      return {
        cancelled_orders: data.length || 0,
        exchange: 'BINANCE',
        status: 'LIVE',
        message: `Отменено ${data.length || 0} ордеров Binance`
      };
    }
    
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Отмена ордеров для ${apiKey.exchange} пока не поддерживается`);
    }

    // Bybit код...
    const timestamp = Date.now();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    const orderData = {
      category: "linear",
      symbol: symbol
    };

    const body = JSON.stringify(orderData);
    const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, body);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/order/cancel-all`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'Content-Type': 'application/json'
      },
      body: body
    });

    const data = await response.json();
    console.log('🔥 Cancel orders response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }

    return {
      cancelled_orders: data.result?.list?.length || 0,
      exchange: "BYBIT",
      status: apiKey.is_testnet ? "TESTNET" : "LIVE",
      message: `Отменено ${data.result?.list?.length || 0} ордеров`
    };

  } catch (error: any) {
    console.error('🔥 Cancel orders error:', error);
    throw new Error(`Ошибка отмены ордеров: ${error.message}`);
  }
}

async function closeAllPositions(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange === 'binance') {
      // Реальное закрытие позиций Binance
      const positions = await getPositions(apiKey, settings);
      
      if (positions.length === 0) {
        return {
          closed_positions: 0,
          exchange: 'BINANCE',
          status: 'LIVE',
          message: 'Нет открытых позиций для закрытия'
        };
      }
      
      let closedCount = 0;
      
      for (const position of positions) {
        const timestamp = Date.now();
        const symbol = position.symbol;
        const quantity = Math.abs(parseFloat(position.positionAmt)).toFixed(6);
        const side = parseFloat(position.positionAmt) > 0 ? 'SELL' : 'BUY'; // Обратная сторона
        
        const queryString = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
        const signature = await createBinanceSignature(apiKey.api_secret, queryString);
        
        const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
        
        console.log('🔥 Binance close position request:', { symbol, side, quantity });
        
        const response = await fetch(`${baseUrl}/fapi/v1/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKey.api_key,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `${queryString}&signature=${signature}`
        });

        const data = await response.json();
        console.log('🔥 Binance close position response:', data);

        if (response.status === 200) {
          closedCount++;
        }
      }
      
      return {
        closed_positions: closedCount,
        exchange: 'BINANCE',
        status: 'LIVE',
        message: `Закрыто ${closedCount} позиций Binance`
      };
    }
    
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Закрытие позиций для ${apiKey.exchange} пока не поддерживается`);
    }

    // Сначала получаем позиции
    const positions = await getPositions(apiKey, settings);
    
    if (positions.length === 0) {
      return {
        closed_positions: 0,
        exchange: "BYBIT",
        status: apiKey.is_testnet ? "TESTNET" : "LIVE",
        message: "Нет открытых позиций для закрытия"
      };
    }

    let closedCount = 0;

    for (const position of positions) {
      if (parseFloat(position.size) === 0) continue;

      const timestamp = Date.now();
      const orderData = {
        category: "linear",
        symbol: position.symbol,
        side: position.side === "Buy" ? "Sell" : "Buy",
        orderType: "Market",
        qty: position.size,
        timeInForce: "IOC",
        reduceOnly: true
      };

      const body = JSON.stringify(orderData);
      const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, body);
      
      const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const url = `${baseUrl}/v5/order/create`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-BAPI-API-KEY': apiKey.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp.toString(),
          'Content-Type': 'application/json'
        },
        body: body
      });

      const data = await response.json();
      console.log(`🔥 Close position ${position.symbol} response:`, data);

      if (data.retCode === 0) {
        closedCount++;
      }
    }

    return {
      closed_positions: closedCount,
      exchange: "BYBIT",
      status: apiKey.is_testnet ? "TESTNET" : "LIVE",
      message: `Закрыто ${closedCount} позиций`
    };

  } catch (error: any) {
    console.error('🔥 Close positions error:', error);
    throw new Error(`Ошибка закрытия позиций: ${error.message}`);
  }
}

async function createBybitSignature(secret: string, timestamp: string, apiKey: string, params: string): Promise<string> {
  const message = timestamp + apiKey + params;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
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

async function createBybitSignatureV2(secret: string, timestamp: string, apiKey: string, body: string): Promise<string> {
  const message = timestamp + apiKey + body;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
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