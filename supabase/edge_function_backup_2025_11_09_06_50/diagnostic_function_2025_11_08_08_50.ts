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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔍 DIAGNOSTIC Function started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🔍 Request body:', JSON.stringify(requestBody, null, 2));
    
    const { action, user_id }: TradingRequest = requestBody;
    
    console.log('🔍 Trading action:', action, 'for user:', user_id);

    if (!user_id) {
      throw new Error('user_id is required');
    }

    let result;

    // Специальная обработка для scan_funding
    if (action === 'scan_funding') {
      console.log('🔍 Handling scan_funding action');
      result = await scanFunding(supabase);
    } else {
      // Получаем настройки пользователя
      console.log('🔍 Fetching user settings...');
      const { data: settings, error: settingsError } = await supabase
        .from('trading_settings')
        .select('*')
        .eq('user_id', user_id)
        .single();

      console.log('🔍 Settings query result:', { settings, settingsError });

      if (settingsError || !settings) {
        console.log('❌ Trading settings not found:', settingsError);
        throw new Error('Trading settings not found for user');
      }

      console.log('✅ User settings loaded:', { 
        exchange: settings.exchange, 
        symbol: `${settings.base_asset}${settings.quote_asset}`,
        user_id: settings.user_id
      });

      // Получаем ВСЕ API ключи пользователя для диагностики
      console.log('🔍 Fetching ALL user API keys for diagnostic...');
      const { data: allApiKeys, error: allApiError } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_id', user_id);

      console.log('🔍 ALL API keys query result:', { 
        allApiKeys: allApiKeys?.map(key => ({
          exchange: key.exchange,
          has_api_key: !!key.api_key,
          api_key_length: key.api_key?.length || 0,
          has_api_secret: !!key.api_secret,
          api_secret_length: key.api_secret?.length || 0,
          has_passphrase: key.has_passphrase,
          is_testnet: key.is_testnet
        })),
        allApiError 
      });

      // Получаем API ключи для конкретной биржи
      console.log('🔍 Fetching API keys for exchange:', settings.exchange);
      const { data: apiKeysArray, error: apiError } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_id', user_id)
        .eq('exchange', settings.exchange);

      console.log('🔍 Exchange-specific API keys query result:', { 
        apiKeysArray: apiKeysArray?.map(key => ({
          exchange: key.exchange,
          has_api_key: !!key.api_key,
          api_key_preview: key.api_key?.substring(0, 10) + '...',
          has_api_secret: !!key.api_secret,
          api_secret_preview: key.api_secret?.substring(0, 10) + '...',
          has_passphrase: key.has_passphrase,
          is_testnet: key.is_testnet
        })),
        apiError,
        exchange: settings.exchange
      });

      if (apiError || !apiKeysArray || apiKeysArray.length === 0) {
        console.log('❌ API keys not found for exchange:', settings.exchange, 'Error:', apiError);
        
        // Возвращаем диагностическую информацию вместо ошибки
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `API keys not found for ${settings.exchange}`,
            diagnostic: {
              user_id: user_id,
              exchange: settings.exchange,
              all_exchanges_with_keys: allApiKeys?.map(k => k.exchange) || [],
              total_api_keys: allApiKeys?.length || 0,
              message: 'USER_DATA_MISSING'
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const apiKeys = apiKeysArray[0]; // Берем первый найденный ключ для биржи
      console.log('✅ API keys loaded for exchange:', settings.exchange, {
        has_api_key: !!apiKeys.api_key,
        has_api_secret: !!apiKeys.api_secret,
        key_preview: apiKeys.api_key?.substring(0, 10) + '...',
        secret_preview: apiKeys.api_secret?.substring(0, 10) + '...'
      });

      // Проверяем наличие обязательных полей
      if (!apiKeys.api_key || !apiKeys.api_secret) {
        console.log('❌ Missing required API credentials');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Missing API credentials for ${settings.exchange}`,
            diagnostic: {
              has_api_key: !!apiKeys.api_key,
              has_api_secret: !!apiKeys.api_secret,
              exchange: settings.exchange,
              message: 'INCOMPLETE_API_KEYS'
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      switch (action) {
        case 'get_balance':
          console.log('🔍 Calling getBalance...');
          result = await getBalance(apiKeys, settings);
          break;
        case 'get_positions':
          console.log('🔍 Calling getPositions...');
          result = await getPositions(apiKeys, settings);
          break;
        case 'place_test_order':
          console.log('🔍 Calling placeTestOrder...');
          result = await placeTestOrder(apiKeys, settings);
          break;
        case 'place_order_with_tp_sl':
          console.log('🔍 Calling placeOrderWithTPSL...');
          result = await placeOrderWithTPSL(apiKeys, settings);
          break;
        case 'cancel_all_orders':
        case 'cancel_orders':
          console.log('🔍 Calling cancelAllOrders...');
          result = await cancelAllOrders(apiKeys, settings);
          break;
        case 'close_all_positions':
        case 'close_positions':
          console.log('🔍 Calling closeAllPositions...');
          result = await closeAllPositions(apiKeys, settings);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    }

    console.log('✅ Function completed successfully:', result);

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ DIAGNOSTIC Error:', error);
    console.error('❌ Error stack:', error.stack);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        diagnostic: {
          error_type: error.constructor.name,
          error_stack: error.stack,
          message: 'FUNCTION_ERROR'
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Сканирование фандинга
async function scanFunding(supabase: any) {
  console.log('🔍 Scanning funding opportunities');
  
  try {
    // Получаем существующие возможности фандинга
    const { data: existingOpportunities, error } = await supabase
      .from('funding_opportunities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.log('⚠️ Warning: Could not fetch existing opportunities:', error);
    }

    // Симуляция сканирования новых возможностей
    const mockOpportunities = [
      {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        funding_rate: 0.0001,
        next_funding_time: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        apy_estimate: 1.095,
        status: 'active'
      },
      {
        exchange: 'bybit', 
        symbol: 'ETHUSDT',
        funding_rate: -0.0002,
        next_funding_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        apy_estimate: -0.584,
        status: 'active'
      },
      {
        exchange: 'gate',
        symbol: 'SUPERUSDT',
        funding_rate: 0.0003,
        next_funding_time: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        apy_estimate: 2.628,
        status: 'active'
      }
    ];

    return {
      message: 'DIAGNOSTIC: Фандинг сканирование выполнено',
      opportunities: mockOpportunities,
      existing_count: existingOpportunities?.length || 0,
      new_opportunities: mockOpportunities.length,
      status: 'SCANNED',
      scan_time: new Date().toISOString()
    };

  } catch (scanError) {
    console.log('❌ Funding scan error:', scanError);
    return {
      message: 'DIAGNOSTIC: Ошибка сканирования фандинга',
      opportunities: [],
      error: scanError.message,
      status: 'ERROR'
    };
  }
}

// Получение баланса
async function getBalance(apiKeys: any, settings: any) {
  console.log('💰 Getting balance for exchange:', settings.exchange);
  
  try {
    if (settings.exchange === 'binance') {
      return await getBinanceBalance(apiKeys);
    } else if (settings.exchange === 'bybit') {
      return await getBybitBalance(apiKeys);
    } else if (settings.exchange === 'gate') {
      return await getGateBalance(apiKeys);
    } else {
      // Для неподдерживаемых бирж возвращаем диагностическую информацию
      return {
        available_balance: '0.00',
        currency: 'USDT',
        status: `DIAGNOSTIC: ${settings.exchange} not implemented yet`,
        exchange: settings.exchange.toUpperCase(),
        message: 'Exchange support in development'
      };
    }
  } catch (balanceError) {
    console.log('❌ Balance error:', balanceError);
    return {
      available_balance: '0.00',
      currency: 'USDT',
      status: 'ERROR',
      exchange: settings.exchange.toUpperCase(),
      error: balanceError.message,
      message: 'DIAGNOSTIC: Balance fetch failed'
    };
  }
}

// Binance баланс
async function getBinanceBalance(apiKeys: any) {
  console.log('🔍 Fetching Binance balance...');
  const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  
  console.log('🔍 Creating Binance signature...');
  const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
  
  console.log('🔍 Making Binance API request...');
  const response = await fetch(`${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`, {
    headers: {
      'X-MBX-APIKEY': apiKeys.api_key
    }
  });

  console.log('🔍 Binance API response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.log('❌ Binance API error:', response.status, errorText);
    throw new Error(`Binance API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('🔍 Binance balance data received:', data?.length, 'assets');
  
  const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
  console.log('🔍 USDT balance found:', usdtBalance);
  
  return {
    available_balance: usdtBalance?.availableBalance || '0.00',
    currency: 'USDT',
    status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
    exchange: 'BINANCE'
  };
}

// Bybit баланс
async function getBybitBalance(apiKeys: any) {
  console.log('🔍 Fetching Bybit balance...');
  const baseUrl = apiKeys.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
  
  const timestamp = Date.now().toString();
  console.log('🔍 Creating Bybit signature...');
  const { signature } = await createBybitSignature(apiKeys.api_secret, timestamp, '{}');
  
  console.log('🔍 Making Bybit API request...');
  const response = await fetch(`${baseUrl}/v5/account/wallet-balance?category=unified`, {
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': '5000'
    }
  });

  console.log('🔍 Bybit API response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.log('❌ Bybit API error:', response.status, errorText);
    throw new Error(`Bybit API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('🔍 Bybit response data:', data);
  
  if (data.retCode !== 0) {
    console.log('❌ Bybit error:', data.retMsg);
    throw new Error(`Bybit error: ${data.retMsg}`);
  }

  const usdtCoin = data.result?.list?.[0]?.coin?.find((coin: any) => coin.coin === 'USDT');
  console.log('🔍 USDT coin found:', usdtCoin);
  
  return {
    available_balance: usdtCoin?.availableToWithdraw || '0.00',
    currency: 'USDT',
    status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
    exchange: 'BYBIT'
  };
}

// Gate.io баланс
async function getGateBalance(apiKeys: any) {
  console.log('🔍 Fetching Gate.io balance...');
  const baseUrl = apiKeys.is_testnet ? 'https://fx-api-testnet.gateio.ws' : 'https://api.gateio.ws';
  const path = '/api/v4/futures/usdt/accounts';
  
  console.log('🔍 Creating Gate.io signature...');
  const { signature, timestamp } = await createGateSignature(
    apiKeys.api_secret, 'GET', path, '', ''
  );
  
  console.log('🔍 Making Gate.io API request...');
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'KEY': apiKeys.api_key,
      'SIGN': signature,
      'Timestamp': timestamp
    }
  });

  console.log('🔍 Gate.io API response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.log('❌ Gate.io API error:', response.status, errorText);
    throw new Error(`Gate.io API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('🔍 Gate.io balance data:', data);
  
  return {
    available_balance: data.available || '0.00',
    currency: 'USDT',
    status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
    exchange: 'GATE'
  };
}

// Заглушки для других функций
async function getPositions(apiKeys: any, settings: any) {
  return {
    positions: [],
    total_positions: 0,
    message: 'DIAGNOSTIC: Positions function called',
    exchange: settings.exchange
  };
}

async function placeTestOrder(apiKeys: any, settings: any) {
  return {
    message: 'DIAGNOSTIC: Test order simulation',
    exchange: settings.exchange,
    symbol: `${settings.base_asset}${settings.quote_asset}`,
    status: 'TEST_MODE'
  };
}

async function placeOrderWithTPSL(apiKeys: any, settings: any) {
  return {
    message: 'DIAGNOSTIC: Order with TP/SL simulation',
    exchange: settings.exchange,
    status: 'SIMULATION'
  };
}

async function cancelAllOrders(apiKeys: any, settings: any) {
  return {
    message: 'DIAGNOSTIC: Cancel orders simulation',
    exchange: settings.exchange
  };
}

async function closeAllPositions(apiKeys: any, settings: any) {
  return {
    message: 'DIAGNOSTIC: Close positions simulation',
    exchange: settings.exchange
  };
}

// Создание подписи для Binance
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

// Создание подписи для Bybit
async function createBybitSignature(secret: string, timestamp: string, params: string) {
  const message = timestamp + 'api_key' + '5000' + params;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return { signature: result };
}

// Создание подписи для Gate.io
async function createGateSignature(secret: string, method: string, path: string, query: string, body: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${method}\n${path}\n${query}\n${body}\n${timestamp}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return { signature: result, timestamp };
}