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

  const diagnostics = [];
  
  try {
    diagnostics.push('🎯 DIAGNOSTIC FUNCTION STARTED');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    const { action, user_id } = requestBody;
    
    diagnostics.push(`🎯 STEP 1: Request received - action: ${action}, user_id: ${user_id}`);

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // STEP 2: Получаем настройки пользователя
    diagnostics.push('🎯 STEP 2: Fetching user settings from trading_settings...');
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settings) {
      diagnostics.push(`❌ STEP 2 FAILED: ${settingsError?.message}`);
      throw new Error(`Настройки не найдены: ${settingsError?.message}`);
    }

    diagnostics.push('✅ STEP 2 SUCCESS: Settings found');
    diagnostics.push(`🎯 STEP 2: Exchange from DB: ${settings.exchange}`);
    diagnostics.push(`🎯 STEP 2: Full settings: ${JSON.stringify(settings)}`);

    // STEP 3: Получаем API ключи для выбранной биржи
    diagnostics.push(`🎯 STEP 3: Fetching API keys for exchange: ${settings.exchange}`);
    const { data: apiKeys, error: apiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', settings.exchange)
      .eq('is_active', true)
      .single();

    if (apiError || !apiKeys) {
      diagnostics.push(`❌ STEP 3 FAILED: ${apiError?.message}`);
      throw new Error(`API ключи не найдены для ${settings.exchange}: ${apiError?.message}`);
    }

    diagnostics.push('✅ STEP 3 SUCCESS: API keys found');
    diagnostics.push(`🎯 STEP 3: API keys exchange: ${apiKeys.exchange}`);

    // STEP 4: Проверка соответствия
    diagnostics.push('🎯 STEP 4: Checking exchange consistency...');
    if (apiKeys.exchange !== settings.exchange) {
      diagnostics.push('❌ STEP 4 FAILED: Exchange mismatch!');
      diagnostics.push(`Settings exchange: ${settings.exchange}`);
      diagnostics.push(`API keys exchange: ${apiKeys.exchange}`);
      throw new Error(`🚨 КРИТИЧЕСКАЯ ОШИБКА: Настройки указывают ${settings.exchange}, но API ключи для ${apiKeys.exchange}!`);
    }

    diagnostics.push('✅ STEP 4 SUCCESS: Exchange consistency check passed');

    // STEP 5: Маршрутизация
    diagnostics.push('🎯 STEP 5: Routing to exchange handler...');
    diagnostics.push(`🎯 STEP 5: Target exchange: ${settings.exchange}`);
    diagnostics.push(`🎯 STEP 5: Action: ${action}`);

    let result;

    if (settings.exchange === 'bybit') {
      diagnostics.push('🔴 STEP 5: Routing to BYBIT handler');
      result = await handleBybitAction(action, apiKeys, settings, diagnostics);
    } else if (settings.exchange === 'binance') {
      diagnostics.push('🟡 STEP 5: Routing to BINANCE handler');
      result = await handleBinanceAction(action, apiKeys, settings, diagnostics);
    } else {
      diagnostics.push(`❌ STEP 5 FAILED: Unsupported exchange: ${settings.exchange}`);
      throw new Error(`Неподдерживаемая биржа: ${settings.exchange}. Поддерживаются: bybit, binance`);
    }

    diagnostics.push('✅ STEP 5 SUCCESS: Handler completed');
    diagnostics.push(`🎯 STEP 6: Final result: ${JSON.stringify(result)}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: result,
        diagnostics: diagnostics
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    diagnostics.push(`❌ UNIVERSAL ERROR: ${error.message}`);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        diagnostics: diagnostics
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ===== BYBIT HANDLERS =====
async function handleBybitAction(action: string, apiKeys: any, settings: any, diagnostics: string[]) {
  diagnostics.push(`🔴 BYBIT HANDLER: Starting action: ${action}`);
  
  if (action === 'get_balance') {
    return await getBybitBalance(apiKeys, settings, diagnostics);
  }
  
  return { message: `Bybit ${action} - stub`, exchange: 'BYBIT' };
}

async function getBybitBalance(apiKeys: any, settings: any, diagnostics: string[]) {
  diagnostics.push('🔴 BYBIT: Getting balance...');
  
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  const queryParams = new URLSearchParams({
    accountType: 'UNIFIED',
    coin: 'USDT'
  });
  
  const { signature } = await createBybitSignature(apiKeys.api_key, apiKeys.api_secret, timestamp, recvWindow, queryParams.toString());
  
  const baseUrl = apiKeys.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
  
  diagnostics.push(`🔴 BYBIT: Making request to: ${baseUrl}`);
  
  const response = await fetch(`${baseUrl}/v5/account/wallet-balance?${queryParams.toString()}`, {
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow
    }
  });

  diagnostics.push(`🔴 BYBIT: Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    diagnostics.push(`🔴 BYBIT: API error: ${errorText}`);
    throw new Error(`Bybit API ошибка: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.retCode !== 0) {
    diagnostics.push(`🔴 BYBIT: API error: ${data.retMsg}`);
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

  diagnostics.push(`🔴 BYBIT: Returning result: ${JSON.stringify(result)}`);
  return result;
}

// ===== BINANCE HANDLERS =====
async function handleBinanceAction(action: string, apiKeys: any, settings: any, diagnostics: string[]) {
  diagnostics.push(`🟡 BINANCE HANDLER: Starting action: ${action}`);
  
  if (action === 'get_balance') {
    return await getBinanceBalance(apiKeys, settings, diagnostics);
  }
  
  return { message: `Binance ${action} - stub`, exchange: 'BINANCE' };
}

async function getBinanceBalance(apiKeys: any, settings: any, diagnostics: string[]) {
  diagnostics.push('🟡 BINANCE: Getting balance...');
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  
  const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
  
  const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  
  diagnostics.push(`🟡 BINANCE: Making request to: ${baseUrl}`);
  
  const response = await fetch(`${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`, {
    headers: {
      'X-MBX-APIKEY': apiKeys.api_key
    }
  });

  diagnostics.push(`🟡 BINANCE: Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    diagnostics.push(`🟡 BINANCE: API error: ${errorText}`);
    throw new Error(`Binance API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
  const availableBalance = usdtBalance?.availableBalance || '0';

  const result = {
    available_balance: availableBalance,
    currency: 'USDT',
    status: 'LIVE ✅',
    exchange: 'BINANCE'
  };

  diagnostics.push(`🟡 BINANCE: Returning result: ${JSON.stringify(result)}`);
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