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
    
    console.log('🟢 GATE DIAGNOSTIC: Starting action:', action);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем API ключи
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    console.log('🟢 GATE DIAGNOSTIC: Keys error:', keysError);
    console.log('🟢 GATE DIAGNOSTIC: Keys found:', !!apiKeys);

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Gate.io API ключи не найдены',
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
      return await testGateEndpoints(apiKeys);
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Неизвестное действие' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE DIAGNOSTIC Error:', error.message);
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

async function testGateEndpoints(apiKeys: any) {
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
    console.log('🟢 Test 1: Server time');
    const timeResponse = await fetch('https://api.gateio.ws/api/v4/spot/time');
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

  // Тест 2: Проверка валютных пар (без подписи)
  try {
    console.log('🟢 Test 2: Currency pairs');
    const pairsResponse = await fetch('https://api.gateio.ws/api/v4/spot/currency_pairs');
    const pairsData = await pairsResponse.json();
    results.tests.currencyPairs = {
      success: pairsResponse.ok,
      pairsCount: Array.isArray(pairsData) ? pairsData.length : 0,
      status: pairsResponse.status
    };
  } catch (error) {
    results.tests.currencyPairs = {
      success: false,
      error: error.message
    };
  }

  // Тест 3: Проверка Spot баланса
  try {
    console.log('🟢 Test 3: Spot balance');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/spot/accounts';
    const queryString = '';
    const bodyPayload = '';
    
    const message = `${method}\n${url}\n${queryString}\n${createHashedPayload(bodyPayload)}\n${timestamp}`;
    const signature = await createSignature(message, apiKeys.api_secret);
    
    const spotResponse = await fetch(`https://api.gateio.ws${url}`, {
      method: method,
      headers: {
        'KEY': apiKeys.api_key,
        'Timestamp': timestamp,
        'SIGN': signature,
        'Content-Type': 'application/json'
      }
    });
    
    const spotData = await spotResponse.json();
    results.tests.spotBalance = {
      success: spotResponse.ok,
      status: spotResponse.status,
      error: spotData.message || null,
      hasAccounts: Array.isArray(spotData)
    };

    if (spotResponse.ok && Array.isArray(spotData)) {
      const usdtAccount = spotData.find(acc => acc.currency === 'USDT');
      results.tests.spotBalance.usdtBalance = usdtAccount?.available || '0';
    }

  } catch (error) {
    results.tests.spotBalance = {
      success: false,
      error: error.message
    };
  }

  // Тест 4: Проверка Futures баланса
  try {
    console.log('🟢 Test 4: Futures balance');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/accounts';
    const queryString = '';
    const bodyPayload = '';
    
    const message = `${method}\n${url}\n${queryString}\n${createHashedPayload(bodyPayload)}\n${timestamp}`;
    const signature = await createSignature(message, apiKeys.api_secret);
    
    const futuresResponse = await fetch(`https://api.gateio.ws${url}`, {
      method: method,
      headers: {
        'KEY': apiKeys.api_key,
        'Timestamp': timestamp,
        'SIGN': signature,
        'Content-Type': 'application/json'
      }
    });
    
    const futuresData = await futuresResponse.json();
    results.tests.futuresBalance = {
      success: futuresResponse.ok,
      status: futuresResponse.status,
      error: futuresData.message || null,
      hasData: !!futuresData.total
    };

    if (futuresResponse.ok && futuresData.total) {
      results.tests.futuresBalance.totalBalance = futuresData.total;
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

// Создание хеша payload
function createHashedPayload(payload: string): string {
  if (!payload) return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // SHA256 of empty string
  
  // Для простоты возвращаем хеш пустой строки, в реальном случае нужно хешировать payload
  return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
}

// Создание подписи
async function createSignature(message: string, secret: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}