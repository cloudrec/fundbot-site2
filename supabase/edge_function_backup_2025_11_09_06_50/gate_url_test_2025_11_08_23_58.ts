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
    const { user_id } = await req.json();
    
    console.log('🧪 GATE.IO URL TEST: Starting comprehensive URL test for user:', user_id);

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

    if (keysError || !apiKeys) {
      console.log('❌ GATE.IO URL TEST: API ключи не найдены');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'API ключи Gate.io не найдены'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ GATE.IO URL TEST: Ключи найдены, тестируем разные эндпоинты...');

    // Тестируем разные эндпоинты
    const testResults = [];

    // 1. SPOT WALLET BALANCE
    const spotResult = await testGateEndpoint(
      apiKeys,
      'https://api.gateio.ws',
      '/api/v4/spot/accounts',
      'GET',
      'SPOT WALLET BALANCE'
    );
    testResults.push(spotResult);

    // 2. FUTURES USDT BALANCE  
    const futuresResult = await testGateEndpoint(
      apiKeys,
      'https://api.gateio.ws',
      '/api/v4/futures/usdt/accounts',
      'GET',
      'FUTURES USDT BALANCE'
    );
    testResults.push(futuresResult);

    // 3. DELIVERY FUTURES BALANCE
    const deliveryResult = await testGateEndpoint(
      apiKeys,
      'https://api.gateio.ws',
      '/api/v4/delivery/usdt/accounts',
      'GET',
      'DELIVERY FUTURES BALANCE'
    );
    testResults.push(deliveryResult);

    // 4. WALLET BALANCE (общий)
    const walletResult = await testGateEndpoint(
      apiKeys,
      'https://api.gateio.ws',
      '/api/v4/wallet/total_balance',
      'GET',
      'TOTAL WALLET BALANCE'
    );
    testResults.push(walletResult);

    console.log('🧪 GATE.IO URL TEST: Все тесты завершены');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Тест разных Gate.io эндпоинтов завершен',
        results: testResults,
        summary: {
          total_tests: testResults.length,
          successful: testResults.filter(r => r.success).length,
          failed: testResults.filter(r => !r.success).length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE.IO URL TEST Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Функция тестирования конкретного эндпоинта
async function testGateEndpoint(apiKey: any, baseUrl: string, endpoint: string, method: string, testName: string) {
  try {
    console.log(`🧪 TESTING ${testName}: ${baseUrl}${endpoint}`);
    
    const { signature, timestamp } = await createGateSignature(apiKey.api_secret, method, endpoint, '', '');
    
    const response = await fetch(baseUrl + endpoint, {
      method: method,
      headers: {
        'KEY': apiKey.api_key,
        'SIGN': signature,
        'Timestamp': timestamp,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    console.log(`📊 ${testName} RESULT:`, {
      status: response.status,
      success: response.status === 200,
      data: response.status === 200 ? data : null,
      error: response.status !== 200 ? data : null
    });

    return {
      test_name: testName,
      endpoint: endpoint,
      full_url: baseUrl + endpoint,
      method: method,
      status: response.status,
      success: response.status === 200,
      data: response.status === 200 ? data : null,
      error: response.status !== 200 ? data : null,
      signature_used: signature.substring(0, 20) + '...',
      timestamp_used: timestamp
    };

  } catch (error) {
    console.error(`❌ ${testName} ERROR:`, error.message);
    return {
      test_name: testName,
      endpoint: endpoint,
      method: method,
      success: false,
      error: error.message
    };
  }
}

// Функция создания подписи Gate.io
async function createGateSignature(secret: string, method: string, url: string, queryString: string = '', payloadString: string = ''): Promise<{ signature: string, timestamp: string }> {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Создаем SHA-512 хеш тела запроса
    const payloadHash = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(payloadString));
    const hashedPayload = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Формат строки подписи: method + '\n' + url + '\n' + query_string + '\n' + hashed_payload + '\n' + timestamp
    const signatureString = `${method}\n${url}\n${queryString}\n${hashedPayload}\n${timestamp}`;
    
    // Создаем HMAC-SHA512 подпись
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(signatureString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return { signature: result, timestamp };
  } catch (error) {
    console.error('❌ Error creating Gate.io signature:', error);
    throw error;
  }
}