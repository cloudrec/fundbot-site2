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
    const { action, user_id } = await req.json();
    
    console.log('🔵 BYBIT DIAGNOSTIC: Starting action:', action);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем API ключи
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'bybit')
      .single();

    console.log('🔵 BYBIT DIAGNOSTIC: Keys error:', keysError);
    console.log('🔵 BYBIT DIAGNOSTIC: Keys found:', !!apiKeys);

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Bybit API ключи не найдены',
          debug: {
            keysError: keysError,
            hasKeys: !!apiKeys
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Проверяем что ключи не пустые
    if (!apiKeys.api_key || !apiKeys.api_secret) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'API ключи пустые',
          debug: {
            hasApiKey: !!apiKeys.api_key,
            hasApiSecret: !!apiKeys.api_secret,
            apiKeyLength: apiKeys.api_key?.length || 0,
            apiSecretLength: apiKeys.api_secret?.length || 0
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Тестируем разные эндпоинты
    if (action === 'get_balance') {
      return await testBybitEndpoints(apiKeys);
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Неизвестное действие' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ BYBIT DIAGNOSTIC Error:', error.message);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function testBybitEndpoints(apiKeys: any) {
  const results = {
    success: false,
    tests: {},
    debug: {
      apiKeyLength: apiKeys.api_key?.length || 0,
      apiSecretLength: apiKeys.api_secret?.length || 0,
      timestamp: Date.now()
    }
  };

  // Тест 1: Проверка времени сервера (без подписи)
  try {
    console.log('🔵 Test 1: Server time');
    const timeResponse = await fetch('https://api.bybit.com/v2/public/time');
    const timeData = await timeResponse.json();
    results.tests.serverTime = {
      success: timeResponse.ok && timeData.ret_code === 0,
      data: timeData,
      status: timeResponse.status
    };
  } catch (error) {
    results.tests.serverTime = {
      success: false,
      error: error.message
    };
  }

  // Тест 2: Проверка символов (без подписи)
  try {
    console.log('🔵 Test 2: Symbols');
    const symbolsResponse = await fetch('https://api.bybit.com/v2/public/symbols');
    const symbolsData = await symbolsResponse.json();
    results.tests.symbols = {
      success: symbolsResponse.ok && symbolsData.ret_code === 0,
      symbolsCount: symbolsData.result?.length || 0,
      status: symbolsResponse.status
    };
  } catch (error) {
    results.tests.symbols = {
      success: false,
      error: error.message
    };
  }

  // Тест 3: Проверка баланса V2 API
  try {
    console.log('🔵 Test 3: V2 Balance');
    const timestamp = Date.now().toString();
    const params = {
      api_key: apiKeys.api_key,
      timestamp: timestamp
    };

    const queryString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const balanceResponse = await fetch(`https://api.bybit.com/v2/private/wallet/balance?${queryString}&sign=${signature}`);
    const balanceData = await balanceResponse.json();
    
    results.tests.v2Balance = {
      success: balanceResponse.ok && balanceData.ret_code === 0,
      status: balanceResponse.status,
      error: balanceData.ret_msg || null,
      code: balanceData.ret_code || null,
      hasResult: !!balanceData.result
    };

    if (balanceResponse.ok && balanceData.ret_code === 0 && balanceData.result) {
      const usdtBalance = balanceData.result.USDT || {};
      results.tests.v2Balance.usdtBalance = usdtBalance.available_balance || '0';
      results.success = true;
    }

  } catch (error) {
    results.tests.v2Balance = {
      success: false,
      error: error.message
    };
  }

  // Тест 4: Проверка V5 API (новый)
  try {
    console.log('🔵 Test 4: V5 Balance');
    const timestamp = Date.now().toString();
    const params = {
      api_key: apiKeys.api_key,
      timestamp: timestamp,
      accountType: 'UNIFIED'
    };

    const queryString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const v5Response = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${queryString}&sign=${signature}`);
    const v5Data = await v5Response.json();
    
    results.tests.v5Balance = {
      success: v5Response.ok && v5Data.retCode === 0,
      status: v5Response.status,
      error: v5Data.retMsg || null,
      code: v5Data.retCode || null,
      hasResult: !!v5Data.result
    };

  } catch (error) {
    results.tests.v5Balance = {
      success: false,
      error: error.message
    };
  }

  return new Response(
    JSON.stringify(results),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Создание подписи
async function createSignature(queryString: string, secret: string) {
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
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}