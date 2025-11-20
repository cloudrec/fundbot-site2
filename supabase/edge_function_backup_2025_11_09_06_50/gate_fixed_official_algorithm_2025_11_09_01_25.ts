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
    
    console.log('🎯 GATE.IO FIXED: Starting with correct payload hashing');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем ключи
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ success: false, error: 'Gate.io API ключи не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🎯 GATE.IO FIXED: Keys found');

    // ТОЧНО КАК В ОФИЦИАЛЬНОМ ПРИМЕРЕ
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/accounts';
    const queryString = '';
    const payloadString = '';

    console.log('🎯 GATE.IO FIXED: Parameters:', {
      timestamp,
      method,
      url,
      queryString,
      payloadString
    });

    // ШАГ 1: Хешируем payload (КАК В ОФИЦИАЛЬНОМ ПРИМЕРЕ!)
    const encoder = new TextEncoder();
    const payloadData = encoder.encode(payloadString);
    
    const payloadHash = await crypto.subtle.digest('SHA-512', payloadData);
    const hashedPayload = Array.from(new Uint8Array(payloadHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('🎯 GATE.IO FIXED: Hashed payload:', hashedPayload);

    // ШАГ 2: Создаем строку для подписи (КАК В ОФИЦИАЛЬНОМ ПРИМЕРЕ!)
    const signatureString = `${method}\n${url}\n${queryString}\n${hashedPayload}\n${timestamp}`;
    
    console.log('🎯 GATE.IO FIXED: Signature string:', JSON.stringify(signatureString));
    console.log('🎯 GATE.IO FIXED: Signature string length:', signatureString.length);

    // ШАГ 3: Создаем HMAC подпись
    const keyData = encoder.encode(apiKeys.api_secret);
    const messageData = encoder.encode(signatureString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const result = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('🎯 GATE.IO FIXED: Final signature:', result);

    // Заголовки как в официальном примере
    const headers = {
      'KEY': apiKeys.api_key,
      'Timestamp': timestamp,
      'SIGN': result,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    console.log('🎯 GATE.IO FIXED: Request headers:', {
      KEY: apiKeys.api_key,
      Timestamp: timestamp,
      SIGN: result.substring(0, 20) + '...',
      Accept: 'application/json',
      'Content-Type': 'application/json'
    });

    // Делаем запрос
    const apiUrl = `https://api.gateio.ws${url}`;
    console.log('🎯 GATE.IO FIXED: Making request to:', apiUrl);

    const response = await fetch(apiUrl, {
      method: method,
      headers: headers
    });

    console.log('🎯 GATE.IO FIXED: Response status:', response.status);

    const responseText = await response.text();
    console.log('🎯 GATE.IO FIXED: Response text:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { raw_response: responseText };
    }

    if (response.status === 200) {
      // Успешный ответ
      const balance = responseData.available || responseData.total || '0.00';
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            available_balance: balance.toString(),
            currency: 'USDT',
            status: '✅ ПОДКЛЮЧЕНО',
            exchange: 'GATE.IO',
            note: 'Успешно подключено к Gate.io с исправленным алгоритмом',
            setup_required: false,
            debug_info: {
              status: response.status,
              timestamp_used: timestamp,
              signature_method: 'OFFICIAL_PYTHON_EXAMPLE',
              hashed_payload: hashedPayload,
              signature_string: signatureString,
              full_response: responseData
            }
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Ошибка
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            available_balance: '0.00',
            currency: 'USDT',
            status: response.status === 401 ? '❌ ОШИБКА ПОДПИСИ' : '❌ ОШИБКА API',
            exchange: 'GATE.IO',
            note: `Ошибка: ${responseData.message || responseText} (Code: ${response.status})`,
            setup_required: true,
            debug_info: {
              status: response.status,
              error: responseData,
              signature_method: 'OFFICIAL_PYTHON_EXAMPLE',
              hashed_payload: hashedPayload,
              signature_string: signatureString,
              signature_used: result.substring(0, 20) + '...',
              timestamp_used: timestamp,
              comparison: {
                old_method: 'GET\\n/api/v4/futures/usdt/accounts\\n\\n\\n' + timestamp,
                new_method: signatureString,
                difference: 'Added hashed payload step'
              }
            }
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('❌ GATE.IO FIXED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});