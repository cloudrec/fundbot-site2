import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

// Rate limiting
const BINANCE_RATE_LIMIT = 2000; // 2 секунды для Binance
const BYBIT_RATE_LIMIT = 1000;   // 1 секунда для Bybit
const lastBinanceCall = new Map();
const lastBybitCall = new Map();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🌟🌟🌟 UNIVERSAL FUNCTION STARTED - DETAILED LOGGING 🌟🌟🌟');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    const { action, user_id } = requestBody;
    
    console.log('🔍 UNIVERSAL: Request details:', { action, user_id });

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // 1. Получаем настройки пользователя
    console.log('🔍 UNIVERSAL: Fetching user settings...');
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🔍 UNIVERSAL: Settings query result:', { settings, settingsError });

    if (settingsError || !settings) {
      throw new Error(`Настройки не найдены: ${settingsError?.message}`);
    }

    console.log('🔍 UNIVERSAL: Settings loaded - exchange:', settings.exchange);
    console.log('🔍 UNIVERSAL: Full settings:', JSON.stringify(settings, null, 2));

    // 2. Получаем API ключи для выбранной биржи
    console.log('🔍 UNIVERSAL: Fetching API keys for exchange:', settings.exchange);
    const { data: apiKeys, error: apiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', settings.exchange)
      .eq('is_active', true)
      .single();

    console.log('🔍 UNIVERSAL: API keys query result:', { 
      exchange: settings.exchange,
      found: !!apiKeys,
      error: apiError?.message || null 
    });

    if (apiError || !apiKeys) {
      throw new Error(`API ключи не найдены для ${settings.exchange}: ${apiError?.message}`);
    }

    console.log('🔍 UNIVERSAL: API keys loaded for exchange:', apiKeys.exchange);

    // 3. КРИТИЧЕСКАЯ ПРОВЕРКА СООТВЕТСТВИЯ
    if (apiKeys.exchange !== settings.exchange) {
      console.error('🚨 CRITICAL MISMATCH:', {
        settings_exchange: settings.exchange,
        api_keys_exchange: apiKeys.exchange
      });
      throw new Error(`🚨 КРИТИЧЕСКАЯ ОШИБКА: Настройки указывают ${settings.exchange}, но API ключи для ${apiKeys.exchange}!`);
    }

    console.log('✅ UNIVERSAL: Exchange consistency check passed:', settings.exchange);

    let result;

    // 4. Rate limiting в зависимости от биржи
    if (settings.exchange === 'binance') {
      console.log('🟡 UNIVERSAL: Applying Binance rate limiting...');
      const now = Date.now();
      const lastCall = lastBinanceCall.get(user_id) || 0;
      const timeSinceLastCall = now - lastCall;
      
      if (timeSinceLastCall < BINANCE_RATE_LIMIT) {
        const waitTime = BINANCE_RATE_LIMIT - timeSinceLastCall;
        console.log(`🟡 BINANCE: Anti-ban protection - waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      lastBinanceCall.set(user_id, Date.now());
    } else if (settings.exchange === 'bybit') {
      console.log('🔴 UNIVERSAL: Applying Bybit rate limiting...');
      const now = Date.now();
      const lastCall = lastBybitCall.get(user_id) || 0;
      const timeSinceLastCall = now - lastCall;
      
      if (timeSinceLastCall < BYBIT_RATE_LIMIT) {
        const waitTime = BYBIT_RATE_LIMIT - timeSinceLastCall;
        console.log(`🔴 BYBIT: Rate limiting - waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      lastBybitCall.set(user_id, Date.now());
    }

    // 5. Маршрутизация по биржам
    console.log('🎯 UNIVERSAL: Routing to exchange:', settings.exchange, 'for action:', action);
    
    switch (settings.exchange) {
      case 'bybit':
        console.log('🔴 UNIVERSAL: Calling Bybit handler...');
        result = await handleBybitAction(action, apiKeys, settings);
        break;
      case 'binance':
        console.log('🟡 UNIVERSAL: Calling Binance handler...');
        result = await handleBinanceAction(action, apiKeys, settings);
        break;
      default:
        throw new Error(`Неподдерживаемая биржа: ${settings.exchange}. Поддерживаются: bybit, binance`);
    }

    console.log('🌟 UNIVERSAL: Final result for', action, 'on', result.exchange || 'unknown');
    console.log('🌟 UNIVERSAL: Result data:', JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ UNIVERSAL Error:', error.message);
    console.error('❌ UNIVERSAL Error stack:', error.stack);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ===== BYBIT HANDLERS =====
async function handleBybitAction(action: string, apiKeys: any, settings: any) {
  console.log('🔴 BYBIT: Handling action:', action);
  console.log('🔴 BYBIT: API keys exchange:', apiKeys.exchange);
  console.log('🔴 BYBIT: Settings exchange:', settings.exchange);
  
  switch (action) {
    case 'get_balance':
      return await getBybitBalance(apiKeys, settings);
    case 'get_positions':
      return await getBybitPositions(apiKeys, settings);
    case 'place_test_order':
      return await placeBybitTestOrder(apiKeys, settings);
    case 'place_order_with_tp_sl':
      return await placeBybitOrderWithTPSL(apiKeys, settings);
    case 'cancel_all_orders':
    case 'cancel_orders':
      return await cancelAllBybitOrders(apiKeys, settings);
    case 'close_all_positions':
    case 'close_positions':
      return await closeAllBybitPositions(apiKeys, settings);
    case 'scan_funding':
      return await scanFunding(apiKeys, settings);
    default:
      throw new Error(`Неизвестное действие для Bybit: ${action}`);
  }
}

async function getBybitBalance(apiKeys: any, settings: any) {
  console.log('🔴 BYBIT: Getting REAL Bybit balance');
  console.log('🔴 BYBIT: Using API key:', apiKeys.api_key?.substring(0, 8) + '...');
  
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  const queryParams = new URLSearchParams({
    accountType: 'UNIFIED',
    coin: 'USDT'
  });
  
  const { signature } = await createBybitSignature(apiKeys.api_key, apiKeys.api_secret, timestamp, recvWindow, queryParams.toString());
  
  const baseUrl = apiKeys.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
  const fullUrl = `${baseUrl}/v5/account/wallet-balance?${queryParams.toString()}`;
  
  console.log('🔴 BYBIT: Making request to:', fullUrl);
  
  const response = await fetch(fullUrl, {
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow
    }
  });

  console.log('🔴 BYBIT: Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('🔴 BYBIT: API error response:', errorText);
    throw new Error(`Bybit API ошибка: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('🔴 BYBIT: API response data:', JSON.stringify(data, null, 2));
  
  if (data.retCode !== 0) {
    throw new Error(`Bybit ошибка: ${data.retMsg}`);
  }

  const usdtBalance = data.result?.list?.[0]?.coin?.find((c: any) => c.coin === 'USDT');
  const availableBalance = usdtBalance?.availableToWithdraw || '0';

  const result = {
    available_balance: availableBalance,
    currency: 'USDT',
    status: 'LIVE ✅',
    exchange: 'BYBIT'
  };

  console.log('🔴 BYBIT: Returning balance result:', result);
  return result;
}

// ===== BINANCE HANDLERS =====
async function handleBinanceAction(action: string, apiKeys: any, settings: any) {
  console.log('🟡 BINANCE: Handling action:', action);
  console.log('🟡 BINANCE: API keys exchange:', apiKeys.exchange);
  console.log('🟡 BINANCE: Settings exchange:', settings.exchange);
  
  switch (action) {
    case 'get_balance':
      return await getBinanceBalance(apiKeys, settings);
    case 'get_positions':
      return await getBinancePositions(apiKeys, settings);
    case 'place_test_order':
      return await placeBinanceTestOrder(apiKeys, settings);
    case 'place_order_with_tp_sl':
      return await placeBinanceOrderWithTPSL(apiKeys, settings);
    case 'cancel_all_orders':
    case 'cancel_orders':
      return await cancelAllBinanceOrders(apiKeys, settings);
    case 'close_all_positions':
    case 'close_positions':
      return await closeAllBinancePositions(apiKeys, settings);
    case 'scan_funding':
      return await scanFunding(apiKeys, settings);
    default:
      throw new Error(`Неизвестное действие для Binance: ${action}`);
  }
}

async function getBinanceBalance(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE: Getting REAL Binance balance');
  console.log('🟡 BINANCE: Using API key:', apiKeys.api_key?.substring(0, 8) + '...');
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  
  const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
  
  const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  const fullUrl = `${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`;
  
  console.log('🟡 BINANCE: Making request to:', fullUrl);
  
  const response = await fetch(fullUrl, {
    headers: {
      'X-MBX-APIKEY': apiKeys.api_key
    }
  });

  console.log('🟡 BINANCE: Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('🟡 BINANCE: API error response:', errorText);
    throw new Error(`Binance API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('🟡 BINANCE: API response data:', JSON.stringify(data, null, 2));

  const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
  const availableBalance = usdtBalance?.availableBalance || '0';

  const result = {
    available_balance: availableBalance,
    currency: 'USDT',
    status: 'LIVE ✅',
    exchange: 'BINANCE'
  };

  console.log('🟡 BINANCE: Returning balance result:', result);
  return result;
}

// ===== SIGNATURE FUNCTIONS =====
async function createBybitSignature(apiKey: string, apiSecret: string, timestamp: string, recvWindow: string, queryString: string) {
  const message = timestamp + apiKey + recvWindow + queryString;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return { signature: signatureHex };
}

async function createBinanceSignature(apiSecret: string, queryString: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(queryString);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return signatureHex;
}

// ===== STUB FUNCTIONS (для краткости) =====
async function getBybitPositions(apiKeys: any, settings: any) {
  return { message: 'Bybit positions - stub', exchange: 'BYBIT' };
}

async function placeBybitTestOrder(apiKeys: any, settings: any) {
  return { message: 'Bybit test order - stub', exchange: 'BYBIT' };
}

async function placeBybitOrderWithTPSL(apiKeys: any, settings: any) {
  return { message: 'Bybit order with TP/SL - stub', exchange: 'BYBIT' };
}

async function cancelAllBybitOrders(apiKeys: any, settings: any) {
  return { message: 'Bybit cancel orders - stub', exchange: 'BYBIT' };
}

async function closeAllBybitPositions(apiKeys: any, settings: any) {
  return { message: 'Bybit close positions - stub', exchange: 'BYBIT' };
}

async function getBinancePositions(apiKeys: any, settings: any) {
  return { message: 'Binance positions - stub', exchange: 'BINANCE' };
}

async function placeBinanceTestOrder(apiKeys: any, settings: any) {
  return { message: 'Binance test order - stub', exchange: 'BINANCE' };
}

async function placeBinanceOrderWithTPSL(apiKeys: any, settings: any) {
  return { message: 'Binance order with TP/SL - stub', exchange: 'BINANCE' };
}

async function cancelAllBinanceOrders(apiKeys: any, settings: any) {
  return { message: 'Binance cancel orders - stub', exchange: 'BINANCE' };
}

async function closeAllBinancePositions(apiKeys: any, settings: any) {
  return { message: 'Binance close positions - stub', exchange: 'BINANCE' };
}

async function scanFunding(apiKeys: any, settings: any) {
  return { message: 'Funding scan - stub', exchange: settings.exchange.toUpperCase() };
}