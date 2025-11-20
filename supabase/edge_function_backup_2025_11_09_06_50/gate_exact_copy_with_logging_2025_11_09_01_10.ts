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
    
    console.log('🎯 GATE.IO EXACT COPY: Starting balance request for user:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем ключи из базы данных
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    if (keysError || !apiKeys) {
      console.log('❌ GATE.IO EXACT COPY: No API keys found');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Gate.io API ключи не найдены'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔑 GATE.IO EXACT COPY: Keys found, lengths:', {
      api_key: apiKeys.api_key?.length,
      api_secret: apiKeys.api_secret?.length
    });

    // ТОЧНО ТАКИЕ ЖЕ параметры как в рабочей версии
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/accounts';
    const queryString = '';
    const body = '';

    console.log('🎯 GATE.IO EXACT COPY: Request parameters:', {
      timestamp,
      method,
      url,
      queryString,
      body
    });

    // ТОЧНО ТАКАЯ ЖЕ подпись как в рабочей версии
    const message = `${method}\n${url}\n${queryString}\n${body}\n${timestamp}`;
    
    console.log('🎯 GATE.IO EXACT COPY: Message for signature:', JSON.stringify(message));
    console.log('🎯 GATE.IO EXACT COPY: Message length:', message.length);
    console.log('🎯 GATE.IO EXACT COPY: Message bytes:', new TextEncoder().encode(message));

    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiKeys.api_secret);
    const messageData = encoder.encode(message);
    
    console.log('🎯 GATE.IO EXACT COPY: Key data length:', keyData.length);
    console.log('🎯 GATE.IO EXACT COPY: Message data length:', messageData.length);
    
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

    console.log('🎯 GATE.IO EXACT COPY: Signature created:', {
      length: result.length,
      preview: result.substring(0, 20) + '...',
      full: result
    });

    // ТОЧНО ТАКИЕ ЖЕ заголовки как в рабочей версии
    const headers = {
      'KEY': apiKeys.api_key,
      'Timestamp': timestamp,
      'SIGN': result,
      'Content-Type': 'application/json'
    };

    console.log('🎯 GATE.IO EXACT COPY: Request headers:', {
      KEY: apiKeys.api_key,
      Timestamp: timestamp,
      SIGN: result.substring(0, 20) + '...',
      'Content-Type': 'application/json'
    });

    // ТОЧНО ТАКОЙ ЖЕ запрос как в рабочей версии
    const apiUrl = `https://api.gateio.ws${url}`;
    console.log('🎯 GATE.IO EXACT COPY: Making request to:', apiUrl);

    const response = await fetch(apiUrl, {
      method: method,
      headers: headers
    });

    console.log('🎯 GATE.IO EXACT COPY: Response status:', response.status);
    console.log('🎯 GATE.IO EXACT COPY: Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('🎯 GATE.IO EXACT COPY: Response text:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { raw_response: responseText };
    }

    console.log('🎯 GATE.IO EXACT COPY: Parsed response:', responseData);

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
            note: 'Успешно подключено к Gate.io',
            setup_required: false,
            debug_info: {
              status: response.status,
              timestamp_used: timestamp,
              signature_length: result.length,
              algorithm: 'HMAC-SHA512',
              message_for_signature: message,
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
            status: '❌ ОШИБКА API',
            exchange: 'GATE.IO',
            note: `Ошибка API: ${responseData.message || responseText} (Code: ${response.status})`,
            setup_required: true,
            debug_info: {
              status: response.status,
              error: responseData,
              signature_used: result.substring(0, 20) + '...',
              timestamp_used: timestamp,
              algorithm: 'HMAC-SHA512',
              message_for_signature: message,
              request_headers: headers,
              full_signature: result,
              api_key_used: apiKeys.api_key,
              api_secret_length: apiKeys.api_secret?.length
            }
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('❌ GATE.IO EXACT COPY Error:', error.message);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        debug_info: {
          error_type: 'Exception',
          error_message: error.message,
          error_stack: error.stack
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});