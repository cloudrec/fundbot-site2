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
    
    console.log('🚀 GATE.IO SIGNATURE FIX: Action:', action, 'User:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем email пользователя
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData.user?.email;
    
    console.log('👤 GATE.IO SIGNATURE FIX: User info:', { user_id, userEmail });

    // Ищем в правильной таблице api_keys_dev
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    console.log('🔑 GATE.IO SIGNATURE FIX: Поиск по UUID:', { found: !!apiKeys, error: keysError?.message });

    let finalKeys = apiKeys;

    // Если не нашли по UUID, пробуем по email
    if (keysError || !apiKeys) {
      console.log('🔍 GATE.IO SIGNATURE FIX: Пробуем по email...');
      
      if (userEmail) {
        const { data: emailKeys, error: emailError } = await supabase
          .from('api_keys_dev')
          .select('*')
          .eq('user_id', userEmail)
          .eq('exchange', 'gate')
          .single();

        console.log('🔑 GATE.IO SIGNATURE FIX: Поиск по email:', { found: !!emailKeys, error: emailError?.message });
        
        if (emailKeys && !emailError) {
          finalKeys = emailKeys;
        }
      }
    }

    if (!finalKeys) {
      console.log('❌ GATE.IO SIGNATURE FIX: API ключи не найдены');
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            available_balance: "0.00",
            currency: "USDT",
            status: "🔑 ДОБАВЬТЕ API КЛЮЧИ",
            exchange: "GATE.IO",
            note: "Перейдите на вкладку \"API Ключи\" и добавьте Gate.io ключи",
            setup_required: true
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ GATE.IO SIGNATURE FIX: Ключи найдены, выполняем действие:', action);

    if (action === 'get_balance') {
      return await getGateBalanceFixed(finalKeys);
    }

    throw new Error(`Неизвестное действие: ${action}`);

  } catch (error) {
    console.error('❌ GATE.IO SIGNATURE FIX Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getGateBalanceFixed(keys: any) {
  try {
    console.log('💰 GATE.IO SIGNATURE FIX: Получаем баланс с исправленной подписью...');
    
    // ИСПРАВЛЕННЫЙ АЛГОРИТМ ПОДПИСИ ДЛЯ GATE.IO
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/accounts';
    const queryString = '';
    const bodyPayload = '';

    console.log('🔐 GATE.IO SIGNATURE FIX: Параметры запроса:', {
      timestamp,
      method,
      url,
      api_key_length: keys.api_key?.length,
      api_secret_length: keys.api_secret?.length
    });

    // Создаем строку для подписи согласно документации Gate.io
    const message = `${method}\n${url}\n${queryString}\n${bodyPayload}\n${timestamp}`;
    
    console.log('🔐 GATE.IO SIGNATURE FIX: Строка для подписи:', {
      message_preview: message.substring(0, 50) + '...',
      message_length: message.length
    });

    // Генерируем HMAC-SHA512 подпись
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keys.api_secret);
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

    console.log('🔐 GATE.IO SIGNATURE FIX: Подпись сгенерирована:', {
      signature_length: signatureHex.length,
      signature_preview: signatureHex.substring(0, 20) + '...'
    });

    // Отправляем запрос к Gate.io API
    const requestUrl = `https://api.gateio.ws${url}`;
    const headers = {
      'KEY': keys.api_key,
      'Timestamp': timestamp,
      'SIGN': signatureHex,
      'Content-Type': 'application/json'
    };

    console.log('📡 GATE.IO SIGNATURE FIX: Отправляем запрос:', {
      url: requestUrl,
      headers: {
        KEY: keys.api_key.substring(0, 10) + '...',
        Timestamp: timestamp,
        SIGN: signatureHex.substring(0, 20) + '...'
      }
    });

    const response = await fetch(requestUrl, {
      method: method,
      headers: headers
    });

    console.log('📡 GATE.IO SIGNATURE FIX: Ответ получен:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ GATE.IO SIGNATURE FIX: Ошибка API:', {
        status: response.status,
        error: errorText
      });
      
      // Проверяем конкретные ошибки
      if (response.status === 401) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              available_balance: "0.00",
              currency: "USDT",
              status: "🔐 НЕВЕРНЫЕ КЛЮЧИ",
              exchange: "GATE.IO",
              note: `Ошибка авторизации: ${errorText}. Проверьте правильность API ключей.`,
              setup_required: true,
              debug_info: {
                timestamp,
                signature_length: signatureHex.length,
                api_key_length: keys.api_key?.length
              }
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Gate.io API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ GATE.IO SIGNATURE FIX: Баланс получен успешно:', {
      available: data.available,
      total: data.total,
      currency: data.currency
    });
    
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          available_balance: data.available || "0.00",
          currency: "USDT",
          status: "✅ ПОДКЛЮЧЕНО",
          exchange: "GATE.IO",
          note: `Баланс: ${data.available || "0.00"} USDT`,
          setup_required: false,
          debug_info: {
            signature_fixed: true,
            timestamp_used: timestamp
          }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE.IO SIGNATURE FIX Balance Error:', error.message);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          available_balance: "0.00",
          currency: "USDT",
          status: "❌ ОШИБКА API",
          exchange: "GATE.IO",
          note: `Ошибка: ${error.message}`,
          setup_required: true
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}