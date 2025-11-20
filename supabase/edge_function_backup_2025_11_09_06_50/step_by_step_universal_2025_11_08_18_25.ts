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
    console.log('🎯 STEP-BY-STEP UNIVERSAL FUNCTION STARTED 🎯');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    const { action, user_id } = requestBody;
    
    console.log('🎯 STEP 1: Request received:', { action, user_id });

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // STEP 2: Получаем настройки пользователя
    console.log('🎯 STEP 2: Fetching user settings from trading_settings...');
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settings) {
      console.error('❌ STEP 2 FAILED:', settingsError);
      throw new Error(`Настройки не найдены: ${settingsError?.message}`);
    }

    console.log('✅ STEP 2 SUCCESS: Settings found');
    console.log('🎯 STEP 2: Exchange from DB:', settings.exchange);
    console.log('🎯 STEP 2: Full settings:', JSON.stringify(settings, null, 2));

    // STEP 3: Получаем API ключи для выбранной биржи
    console.log('🎯 STEP 3: Fetching API keys for exchange:', settings.exchange);
    const { data: apiKeys, error: apiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', settings.exchange)
      .eq('is_active', true)
      .single();

    if (apiError || !apiKeys) {
      console.error('❌ STEP 3 FAILED:', apiError);
      throw new Error(`API ключи не найдены для ${settings.exchange}: ${apiError?.message}`);
    }

    console.log('✅ STEP 3 SUCCESS: API keys found');
    console.log('🎯 STEP 3: API keys exchange:', apiKeys.exchange);

    // STEP 4: Проверка соответствия
    console.log('🎯 STEP 4: Checking exchange consistency...');
    if (apiKeys.exchange !== settings.exchange) {
      console.error('❌ STEP 4 FAILED: Exchange mismatch!');
      console.error('Settings exchange:', settings.exchange);
      console.error('API keys exchange:', apiKeys.exchange);
      throw new Error(`🚨 КРИТИЧЕСКАЯ ОШИБКА: Настройки указывают ${settings.exchange}, но API ключи для ${apiKeys.exchange}!`);
    }

    console.log('✅ STEP 4 SUCCESS: Exchange consistency check passed');

    // STEP 5: Маршрутизация
    console.log('🎯 STEP 5: Routing to exchange handler...');
    console.log('🎯 STEP 5: Target exchange:', settings.exchange);
    console.log('🎯 STEP 5: Action:', action);

    let result;

    if (settings.exchange === 'bybit') {
      console.log('🔴 STEP 5: Routing to BYBIT handler');
      result = await handleBybitAction(action, apiKeys, settings);
    } else if (settings.exchange === 'binance') {
      console.log('🟡 STEP 5: Routing to BINANCE handler');
      result = await handleBinanceAction(action, apiKeys, settings);
    } else {
      console.error('❌ STEP 5 FAILED: Unsupported exchange:', settings.exchange);
      throw new Error(`Неподдерживаемая биржа: ${settings.exchange}. Поддерживаются: bybit, binance`);
    }

    console.log('✅ STEP 5 SUCCESS: Handler completed');
    console.log('🎯 STEP 6: Final result:', JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ UNIVERSAL ERROR:', error.message);
    console.error('❌ ERROR STACK:', error.stack);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ===== BYBIT HANDLERS =====
async function handleBybitAction(action: string, apiKeys: any, settings: any) {
  console.log('🔴 BYBIT HANDLER: Starting action:', action);
  
  switch (action) {
    case 'get_balance':
      return await getBybitBalance(apiKeys, settings);
    case 'place_order_with_tp_sl':
      return await placeBybitOrderWithTPSL(apiKeys, settings);
    case 'close_positions':
      return await closeBybitPositions(apiKeys, settings);
    case 'cancel_orders':
      return await cancelBybitOrders(apiKeys, settings);
    case 'scan_funding':
      return await scanFunding(apiKeys, settings);
    default:
      return { message: `Bybit ${action} - stub`, exchange: 'BYBIT' };
  }
}

async function getBybitBalance(apiKeys: any, settings: any) {
  console.log('🔴 BYBIT: Getting balance...');
  
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  const queryParams = new URLSearchParams({
    accountType: 'UNIFIED',
    coin: 'USDT'
  });
  
  const { signature } = await createBybitSignature(apiKeys.api_key, apiKeys.api_secret, timestamp, recvWindow, queryParams.toString());
  
  const baseUrl = apiKeys.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
  
  const response = await fetch(`${baseUrl}/v5/account/wallet-balance?${queryParams.toString()}`, {
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bybit API ошибка: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.retCode !== 0) {
    throw new Error(`Bybit ошибка: ${data.retMsg}`);
  }

  const usdtBalance = data.result?.list?.[0]?.coin?.find((c: any) => c.coin === 'USDT');
  const availableBalance = usdtBalance?.availableToWithdraw || '0';

  return {
    available_balance: availableBalance,
    currency: 'USDT',
    status: 'LIVE ✅',
    exchange: 'BYBIT'
  };
}

// ===== BINANCE HANDLERS =====
async function handleBinanceAction(action: string, apiKeys: any, settings: any) {
  console.log('🟡 BINANCE HANDLER: Starting action:', action);
  
  switch (action) {
    case 'get_balance':
      return await getBinanceBalance(apiKeys, settings);
    case 'place_order_with_tp_sl':
      return await placeBinanceOrderWithTPSL(apiKeys, settings);
    case 'close_positions':
      return await closeBinancePositions(apiKeys, settings);
    case 'cancel_orders':
      return await cancelBinanceOrders(apiKeys, settings);
    case 'scan_funding':
      return await scanFunding(apiKeys, settings);
    default:
      return { message: `Binance ${action} - stub`, exchange: 'BINANCE' };
  }
}

async function getBinanceBalance(apiKeys: any, settings: any) {
  console.log('🟡 BINANCE: Getting balance...');
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  
  const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
  
  const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  
  const response = await fetch(`${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`, {
    headers: {
      'X-MBX-APIKEY': apiKeys.api_key
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Binance API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
  const availableBalance = usdtBalance?.availableBalance || '0';

  return {
    available_balance: availableBalance,
    currency: 'USDT',
    status: 'LIVE ✅',
    exchange: 'BINANCE'
  };
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

// ===== STUB FUNCTIONS =====
async function placeBybitOrderWithTPSL(apiKeys: any, settings: any) {
  return { message: 'Bybit order with TP/SL - stub', exchange: 'BYBIT' };
}

async function closeBybitPositions(apiKeys: any, settings: any) {
  return { message: 'Bybit close positions - stub', exchange: 'BYBIT' };
}

async function cancelBybitOrders(apiKeys: any, settings: any) {
  return { message: 'Bybit cancel orders - stub', exchange: 'BYBIT' };
}

async function placeBinanceOrderWithTPSL(apiKeys: any, settings: any) {
  return { message: 'Binance order with TP/SL - stub', exchange: 'BINANCE' };
}

async function closeBinancePositions(apiKeys: any, settings: any) {
  return { message: 'Binance close positions - stub', exchange: 'BINANCE' };
}

async function cancelBinanceOrders(apiKeys: any, settings: any) {
  return { message: 'Binance cancel orders - stub', exchange: 'BINANCE' };
}

async function scanFunding(apiKeys: any, settings: any) {
  return { message: 'Funding scan - stub', exchange: settings.exchange.toUpperCase() };
}