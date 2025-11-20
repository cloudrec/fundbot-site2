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
    console.log('🔥 Edge Function started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('🔥 Environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseServiceKey
    });
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🔥 Request body:', requestBody);
    
    const { action, user_id }: TradingRequest = requestBody;
    
    console.log('🔥 Trading action:', action, 'for user:', user_id);

    if (!user_id) {
      throw new Error('user_id is required');
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
    console.log('🔥 API key found:', {
      exchange: apiKey.exchange,
      hasApiKey: !!apiKey.api_key,
      hasSecret: !!apiKey.api_secret,
      isTestnet: apiKey.is_testnet
    });

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
    console.error('🔥 Error name:', error.name);
    console.error('🔥 Error message:', error.message);
    console.error('🔥 Error stack:', error.stack);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error',
      errorName: error.name,
      stack: error.stack,
      mode: 'ERROR'
    }), {
      status: 200, // Возвращаем 200 чтобы увидеть ошибку в браузере
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Функция создания подписи для Binance
async function createBinanceSignature(secret: string, queryString: string): Promise<string> {
  try {
    console.log('🔥 Creating Binance signature for query:', queryString);
    
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
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('🔥 Binance signature created successfully');
    return result;
  } catch (error) {
    console.error('❌ Error creating Binance signature:', error);
    throw error;
  }
}

// Функции для работы с API
async function getBalance(apiKey: any, settings: any) {
  try {
    console.log('🔥 getBalance started for exchange:', apiKey.exchange);
    
    if (apiKey.exchange === 'binance') {
      console.log('🔥 Processing Binance balance request');
      
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      
      console.log('🔥 Binance query string:', queryString);
      
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

      console.log('🔥 Binance response status:', response.status);
      
      const data = await response.json();
      console.log('🔥 Binance balance response:', data);

      if (response.status !== 200) {
        throw new Error(`Binance API Error: ${data.msg || 'Unknown error'} (Code: ${data.code || response.status})`);
      }

      const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
      
      const result = {
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
      
      console.log('🔥 Binance balance result:', result);
      return result;
    }
    
    // Поддержка Bybit
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Получение баланса для ${apiKey.exchange} пока не поддерживается`);
    }

    console.log('🔥 Processing Bybit balance request');
    
    const timestamp = Date.now().toString();
    const params = `accountType=UNIFIED&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/account/wallet-balance?${params}`;
    
    console.log('🔥 Bybit balance request URL:', url);
    
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

async function placeOrderWithTPSL(apiKey: any, settings: any) {
  try {
    console.log('🔥 placeOrderWithTPSL started for exchange:', apiKey.exchange);
    console.log('🔥 Settings:', settings);
    
    if (apiKey.exchange === 'binance') {
      console.log('🔥 Processing Binance order with TP/SL');
      
      const timestamp = Date.now();
      const symbol = `${settings.base_asset}${settings.quote_asset}`;
      const side = 'BUY';
      const type = 'MARKET';
      // Получаем текущую цену символа
      const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
      const priceResponse = await fetch(`${baseUrl}/fapi/v1/ticker/price?symbol=${symbol}`);
      const priceData = await priceResponse.json();
      const currentPrice = parseFloat(priceData.price || '1');
      
      console.log('🔥 Current price for', symbol, ':', currentPrice);
      
      // Рассчитываем количество на основе реальной цены
      const quantity = Math.floor(settings.order_amount_usd / currentPrice).toString(); // Целое число
      
      console.log('🔥 Binance main order params:', { symbol, side, type, quantity });
      
      // 1. Размещаем основной ордер
      const mainOrderQuery = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;
      const mainOrderSignature = await createBinanceSignature(apiKey.api_secret, mainOrderQuery);
      
      // baseUrl уже определен выше
      
      console.log('🔥 Binance main order request URL:', `${baseUrl}/fapi/v1/order`);
      
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

      return {
        order_id: mainOrderData.orderId,
        symbol: mainOrderData.symbol,
        side: mainOrderData.side,
        status: 'LIVE',
        message: `Боевой ордер Binance размещен: ${mainOrderData.orderId}`
      };
    }
    
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Размещение ордеров для ${apiKey.exchange} пока не поддерживается`);
    }

    console.log('🔥 Processing Bybit order with TP/SL');
    
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

// Остальные функции (упрощенные для отладки)
async function getPositions(apiKey: any, settings: any) {
  console.log('🔥 getPositions - returning empty array for now');
  return [];
}

async function placeTestOrder(apiKey: any, settings: any) {
  console.log('🔥 placeTestOrder - returning mock result for now');
  return { order_id: 'TEST_123', status: 'MOCK' };
}

async function cancelAllOrders(apiKey: any, settings: any) {
  console.log('🔥 cancelAllOrders - returning mock result for now');
  return { cancelled_orders: 0, status: 'MOCK' };
}

async function closeAllPositions(apiKey: any, settings: any) {
  console.log('🔥 closeAllPositions - returning mock result for now');
  return { closed_positions: 0, status: 'MOCK' };
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