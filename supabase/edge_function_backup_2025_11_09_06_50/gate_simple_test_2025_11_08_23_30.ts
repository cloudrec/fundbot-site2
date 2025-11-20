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
    
    console.log('🧪 GATE.IO SIMPLE TEST for user_id:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем email пользователя
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData.user?.email;
    
    // Ищем ключи Gate.io
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    let finalKeys = apiKeys;

    if (keysError || !apiKeys) {
      if (userEmail) {
        const { data: emailKeys, error: emailError } = await supabase
          .from('api_keys_dev')
          .select('*')
          .eq('user_id', userEmail)
          .eq('exchange', 'gate')
          .single();
        
        if (emailKeys && !emailError) {
          finalKeys = emailKeys;
        }
      }
    }

    if (!finalKeys) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Gate.io API ключи не найдены"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🧪 GATE.IO: Тестируем ключи:', {
      api_key: finalKeys.api_key?.substring(0, 10) + '...',
      api_secret_length: finalKeys.api_secret?.length
    });

    // ТЕСТ 1: Простой публичный endpoint (без подписи)
    console.log('🧪 TEST 1: Публичный endpoint...');
    const publicResponse = await fetch('https://api.gateio.ws/api/v4/futures/usdt/tickers');
    const publicData = await publicResponse.json();
    
    console.log('🧪 TEST 1 RESULT:', {
      status: publicResponse.status,
      ok: publicResponse.ok,
      data_length: Array.isArray(publicData) ? publicData.length : 'not array'
    });

    // ТЕСТ 2: Проверка API ключа (простой endpoint)
    console.log('🧪 TEST 2: Проверка API ключа...');
    
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/spot/accounts';  // Более простой endpoint
    const queryString = '';
    const bodyPayload = '';

    const message = `${method}\n${url}\n${queryString}\n${bodyPayload}\n${timestamp}`;
    
    console.log('🧪 TEST 2: Создаем подпись для:', {
      method,
      url,
      timestamp,
      message_length: message.length
    });

    // Генерируем подпись
    const encoder = new TextEncoder();
    const keyData = encoder.encode(finalKeys.api_secret);
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

    console.log('🧪 TEST 2: Подпись создана:', {
      signature_length: signatureHex.length,
      signature_preview: signatureHex.substring(0, 20) + '...'
    });

    // Отправляем запрос
    const spotResponse = await fetch(`https://api.gateio.ws${url}`, {
      method: method,
      headers: {
        'KEY': finalKeys.api_key,
        'Timestamp': timestamp,
        'SIGN': signatureHex,
        'Content-Type': 'application/json'
      }
    });

    console.log('🧪 TEST 2 RESPONSE:', {
      status: spotResponse.status,
      statusText: spotResponse.statusText,
      ok: spotResponse.ok
    });

    let spotData = null;
    let spotError = null;

    if (spotResponse.ok) {
      spotData = await spotResponse.json();
      console.log('🧪 TEST 2 SUCCESS:', spotData);
    } else {
      spotError = await spotResponse.text();
      console.log('🧪 TEST 2 ERROR:', spotError);
    }

    // ТЕСТ 3: Futures endpoint (оригинальный)
    console.log('🧪 TEST 3: Futures endpoint...');
    
    const futuresUrl = '/api/v4/futures/usdt/accounts';
    const futuresMessage = `${method}\n${futuresUrl}\n${queryString}\n${bodyPayload}\n${timestamp}`;
    
    const futuresMessageData = encoder.encode(futuresMessage);
    const futuresSignature = await crypto.subtle.sign('HMAC', cryptoKey, futuresMessageData);
    const futuresSignatureHex = Array.from(new Uint8Array(futuresSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const futuresResponse = await fetch(`https://api.gateio.ws${futuresUrl}`, {
      method: method,
      headers: {
        'KEY': finalKeys.api_key,
        'Timestamp': timestamp,
        'SIGN': futuresSignatureHex,
        'Content-Type': 'application/json'
      }
    });

    console.log('🧪 TEST 3 RESPONSE:', {
      status: futuresResponse.status,
      ok: futuresResponse.ok
    });

    let futuresData = null;
    let futuresError = null;

    if (futuresResponse.ok) {
      futuresData = await futuresResponse.json();
      console.log('🧪 TEST 3 SUCCESS:', futuresData);
    } else {
      futuresError = await futuresResponse.text();
      console.log('🧪 TEST 3 ERROR:', futuresError);
    }

    // Результат тестов
    const result = {
      user_id,
      userEmail,
      api_key_info: {
        key_length: finalKeys.api_key?.length,
        secret_length: finalKeys.api_secret?.length,
        key_preview: finalKeys.api_key?.substring(0, 10) + '...'
      },
      tests: {
        public_api: {
          success: publicResponse.ok,
          status: publicResponse.status,
          data_available: !!publicData
        },
        spot_api: {
          success: spotResponse.ok,
          status: spotResponse.status,
          data: spotData,
          error: spotError
        },
        futures_api: {
          success: futuresResponse.ok,
          status: futuresResponse.status,
          data: futuresData,
          error: futuresError
        }
      },
      diagnosis: {
        keys_found: !!finalKeys,
        public_api_works: publicResponse.ok,
        spot_api_works: spotResponse.ok,
        futures_api_works: futuresResponse.ok,
        signature_algorithm: 'HMAC-SHA512',
        timestamp_used: timestamp
      }
    };

    console.log('🧪 GATE.IO COMPLETE TEST RESULT:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE.IO SIMPLE TEST Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});