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
    console.log('🚀🚀🚀 COMPLETELY NEW FUNCTION - NO CACHE 🚀🚀🚀');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    const { action, user_id } = requestBody;
    
    console.log('🚀 NEW: Request details:', { action, user_id });

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // 1. Получаем настройки пользователя
    console.log('🚀 NEW: Fetching user settings...');
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🚀 NEW: Settings query result:', { settings, settingsError });

    if (settingsError || !settings) {
      throw new Error(`Настройки не найдены: ${settingsError?.message}`);
    }

    console.log('🚀 NEW: Settings loaded - exchange:', settings.exchange);

    // 2. Получаем API ключи для выбранной биржи
    console.log('🚀 NEW: Fetching API keys for exchange:', settings.exchange);
    const { data: apiKeys, error: apiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', settings.exchange)
      .eq('is_active', true)
      .single();

    console.log('🚀 NEW: API keys query result:', { 
      exchange: settings.exchange,
      found: !!apiKeys,
      error: apiError?.message || null 
    });

    if (apiError || !apiKeys) {
      throw new Error(`API ключи не найдены для ${settings.exchange}: ${apiError?.message}`);
    }

    console.log('🚀 NEW: API keys loaded for exchange:', apiKeys.exchange);

    // 3. КРИТИЧЕСКАЯ ПРОВЕРКА СООТВЕТСТВИЯ
    if (apiKeys.exchange !== settings.exchange) {
      console.error('🚨 NEW CRITICAL MISMATCH:', {
        settings_exchange: settings.exchange,
        api_keys_exchange: apiKeys.exchange
      });
      throw new Error(`🚨 КРИТИЧЕСКАЯ ОШИБКА: Настройки указывают ${settings.exchange}, но API ключи для ${apiKeys.exchange}!`);
    }

    console.log('✅ NEW: Exchange consistency check passed:', settings.exchange);

    let result;

    // 4. Маршрутизация по биржам
    console.log('🎯 NEW: Routing to exchange:', settings.exchange, 'for action:', action);
    
    if (settings.exchange === 'bybit') {
      console.log('🔴 NEW: Calling Bybit handler...');
      result = await handleBybitAction(action, apiKeys, settings);
    } else if (settings.exchange === 'binance') {
      console.log('🟡 NEW: Calling Binance handler...');
      result = await handleBinanceAction(action, apiKeys, settings);
    } else {
      throw new Error(`Неподдерживаемая биржа: ${settings.exchange}`);
    }

    console.log('🚀 NEW: Final result for', action, 'on', result.exchange || 'unknown');
    console.log('🚀 NEW: Result data:', JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ NEW Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ===== BYBIT HANDLERS =====
async function handleBybitAction(action: string, apiKeys: any, settings: any) {
  console.log('🔴 NEW BYBIT: Handling action:', action);
  
  if (action === 'get_balance') {
    return await getBybitBalance(apiKeys, settings);
  }
  
  return { message: `Bybit ${action} - stub`, exchange: 'BYBIT' };
}

async function getBybitBalance(apiKeys: any, settings: any) {
  console.log('🔴 NEW BYBIT: Getting REAL Bybit balance');
  
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

  const result = {
    available_balance: availableBalance,
    currency: 'USDT',
    status: 'LIVE ✅',
    exchange: 'BYBIT'
  };

  console.log('🔴 NEW BYBIT: Returning balance result:', result);
  return result;
}

// ===== BINANCE HANDLERS =====
async function handleBinanceAction(action: string, apiKeys: any, settings: any) {
  console.log('🟡 NEW BINANCE: Handling action:', action);
  
  if (action === 'get_balance') {
    return await getBinanceBalance(apiKeys, settings);
  }
  
  return { message: `Binance ${action} - stub`, exchange: 'BINANCE' };
}

async function getBinanceBalance(apiKeys: any, settings: any) {
  console.log('🟡 NEW BINANCE: Getting REAL Binance balance');
  
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

  const result = {
    available_balance: availableBalance,
    currency: 'USDT',
    status: 'LIVE ✅',
    exchange: 'BINANCE'
  };

  console.log('🟡 NEW BINANCE: Returning balance result:', result);
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