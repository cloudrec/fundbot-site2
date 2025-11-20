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
    
    console.log('🔍 BINANCE DIAGNOSTIC: Starting action:', action);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем API ключи
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'binance')
      .single();

    console.log('🔍 BINANCE DIAGNOSTIC: Keys error:', keysError);
    console.log('🔍 BINANCE DIAGNOSTIC: Keys found:', !!apiKeys);

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Binance API ключи не найдены',
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
      return await testBinanceEndpoints(apiKeys);
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Неизвестное действие' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ BINANCE DIAGNOSTIC Error:', error.message);
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

async function testBinanceEndpoints(apiKeys: any) {
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
    console.log('🔍 Test 1: Server time');
    const timeResponse = await fetch('https://fapi.binance.com/fapi/v1/time');
    const timeData = await timeResponse.json();
    results.tests.serverTime = {
      success: timeResponse.ok,
      data: timeData,
      status: timeResponse.status
    };
  } catch (error) {
    results.tests.serverTime = {
      success: false,
      error: error.message
    };
  }

  // Тест 2: Проверка информации об обмене (без подписи)
  try {
    console.log('🔍 Test 2: Exchange info');
    const infoResponse = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const infoData = await infoResponse.json();
    results.tests.exchangeInfo = {
      success: infoResponse.ok,
      symbolsCount: infoData.symbols?.length || 0,
      status: infoResponse.status
    };
  } catch (error) {
    results.tests.exchangeInfo = {
      success: false,
      error: error.message
    };
  }

  // Тест 3: Проверка баланса Spot API
  try {
    console.log('🔍 Test 3: Spot balance');
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const spotResponse = await fetch(`https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`, {
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
      },
    });
    
    const spotData = await spotResponse.json();
    results.tests.spotBalance = {
      success: spotResponse.ok,
      status: spotResponse.status,
      error: spotData.msg || null,
      code: spotData.code || null
    };
  } catch (error) {
    results.tests.spotBalance = {
      success: false,
      error: error.message
    };
  }

  // Тест 4: Проверка баланса Futures API
  try {
    console.log('🔍 Test 4: Futures balance');
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createSignature(queryString, apiKeys.api_secret);
    
    const futuresResponse = await fetch(`https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`, {
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
      },
    });
    
    const futuresData = await futuresResponse.json();
    results.tests.futuresBalance = {
      success: futuresResponse.ok,
      status: futuresResponse.status,
      error: futuresData.msg || null,
      code: futuresData.code || null,
      hasAssets: !!futuresData.assets
    };

    if (futuresResponse.ok && futuresData.assets) {
      const usdtBalance = futuresData.assets.find((asset: any) => asset.asset === 'USDT');
      results.tests.futuresBalance.usdtBalance = usdtBalance?.availableBalance || '0';
      results.success = true;
    }

  } catch (error) {
    results.tests.futuresBalance = {
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