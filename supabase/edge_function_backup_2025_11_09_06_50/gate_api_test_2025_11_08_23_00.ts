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
    
    console.log('🧪 GATE.IO TEST START for user_id:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем email пользователя
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData.user?.email;
    
    console.log('👤 User:', { user_id, userEmail });

    const testResults = {
      user_id,
      userEmail,
      tests: []
    };

    // ТЕСТ 1: Поиск по UUID
    console.log('🧪 TEST 1: Searching by UUID...');
    const { data: keysByUUID, error: uuidError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate');

    testResults.tests.push({
      test: 'search_by_uuid',
      query: `SELECT * FROM api_keys WHERE user_id = '${user_id}' AND exchange = 'gate'`,
      success: !uuidError && keysByUUID && keysByUUID.length > 0,
      found: keysByUUID?.length || 0,
      data: keysByUUID,
      error: uuidError?.message
    });

    console.log('🧪 TEST 1 RESULT:', testResults.tests[0]);

    // ТЕСТ 2: Поиск по email
    if (userEmail) {
      console.log('🧪 TEST 2: Searching by email...');
      const { data: keysByEmail, error: emailError } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', userEmail)
        .eq('exchange', 'gate');

      testResults.tests.push({
        test: 'search_by_email',
        query: `SELECT * FROM api_keys WHERE user_id = '${userEmail}' AND exchange = 'gate'`,
        success: !emailError && keysByEmail && keysByEmail.length > 0,
        found: keysByEmail?.length || 0,
        data: keysByEmail,
        error: emailError?.message
      });

      console.log('🧪 TEST 2 RESULT:', testResults.tests[1]);

      // ТЕСТ 3: Если нашли ключи по email, тестируем Gate.io API
      if (keysByEmail && keysByEmail.length > 0) {
        const gateKey = keysByEmail[0];
        console.log('🧪 TEST 3: Testing Gate.io API with found keys...');
        
        try {
          const apiTest = await testGateAPI(gateKey.api_key, gateKey.api_secret);
          testResults.tests.push({
            test: 'gate_api_test',
            success: apiTest.success,
            data: apiTest,
            error: apiTest.error
          });
        } catch (error) {
          testResults.tests.push({
            test: 'gate_api_test',
            success: false,
            error: error.message
          });
        }

        console.log('🧪 TEST 3 RESULT:', testResults.tests[testResults.tests.length - 1]);
      }
    }

    // ТЕСТ 4: Все ключи пользователя
    console.log('🧪 TEST 4: All user keys...');
    const { data: allKeys, error: allKeysError } = await supabase
      .from('api_keys')
      .select('*')
      .or(`user_id.eq.${user_id},user_id.eq.${userEmail}`);

    testResults.tests.push({
      test: 'all_user_keys',
      success: !allKeysError,
      found: allKeys?.length || 0,
      data: allKeys,
      error: allKeysError?.message
    });

    console.log('🧪 TEST 4 RESULT:', testResults.tests[testResults.tests.length - 1]);

    console.log('🧪 ALL TESTS COMPLETE:', testResults);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: testResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE TEST Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// 🧪 ТЕСТИРОВАНИЕ GATE.IO API
async function testGateAPI(apiKey: string, apiSecret: string) {
  try {
    console.log('🧪 Testing Gate.io API with keys:', {
      key_length: apiKey?.length,
      secret_length: apiSecret?.length,
      key_preview: apiKey?.substring(0, 10) + '...'
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/accounts';
    const queryString = '';
    const body = '';

    // Генерируем подпись
    const message = `${method}\n${url}\n${queryString}\n${body}\n${timestamp}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const messageData = encoder.encode(message);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('🧪 Gate.io API request:', {
      url: `https://api.gateio.ws${url}`,
      headers: {
        'KEY': apiKey,
        'Timestamp': timestamp,
        'SIGN': signatureHex.substring(0, 20) + '...'
      }
    });

    const response = await fetch(`https://api.gateio.ws${url}`, {
      method: method,
      headers: {
        'KEY': apiKey,
        'Timestamp': timestamp,
        'SIGN': signatureHex,
        'Content-Type': 'application/json'
      }
    });

    console.log('🧪 Gate.io API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('🧪 Gate.io API error:', errorText);
      return {
        success: false,
        status: response.status,
        error: errorText,
        message: `Gate.io API error: ${response.status} ${errorText}`
      };
    }

    const data = await response.json();
    console.log('🧪 Gate.io API success:', data);
    
    return {
      success: true,
      status: response.status,
      data: data,
      balance: data.available || '0',
      message: `Gate.io API работает! Баланс: ${data.available || '0'} USDT`
    };

  } catch (error) {
    console.log('🧪 Gate.io API exception:', error.message);
    return {
      success: false,
      error: error.message,
      message: `Ошибка тестирования Gate.io API: ${error.message}`
    };
  }
}