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
    
    console.log('🟢 GATE.IO WORKING: Action:', action, 'User:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем email пользователя
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData.user?.email;
    
    console.log('👤 GATE.IO WORKING: User info:', { user_id, userEmail });

    // Ищем в правильной таблице api_keys_dev
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    console.log('🔑 GATE.IO WORKING: Поиск по UUID:', { found: !!apiKeys, error: keysError?.message });

    let finalKeys = apiKeys;

    // Если не нашли по UUID, пробуем по email
    if (keysError || !apiKeys) {
      console.log('🔍 GATE.IO WORKING: Пробуем по email...');
      
      if (userEmail) {
        const { data: emailKeys, error: emailError } = await supabase
          .from('api_keys_dev')
          .select('*')
          .eq('user_id', userEmail)
          .eq('exchange', 'gate')
          .single();

        console.log('🔑 GATE.IO WORKING: Поиск по email:', { found: !!emailKeys, error: emailError?.message });
        
        if (emailKeys && !emailError) {
          finalKeys = emailKeys;
        }
      }
    }

    if (!finalKeys) {
      console.log('❌ GATE.IO WORKING: API ключи не найдены');
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

    console.log('✅ GATE.IO WORKING: Ключи найдены, выполняем действие:', action);

    if (action === 'get_balance') {
      return await getGateBalanceWorking(finalKeys);
    }

    throw new Error(`Неизвестное действие: ${action}`);

  } catch (error) {
    console.error('❌ GATE.IO WORKING Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// 🔥 РАБОЧАЯ ФУНКЦИЯ ПОДПИСИ ИЗ WORKING_FUNDING
async function createCompleteGateSignature(secret: string, method: string, url: string, queryString: string = '', payloadString: string = ''): Promise<{ signature: string, timestamp: string }> {
  try {
    // Используем текущее время в секундах (как в официальном примере)
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    console.log('🔥 GATE.IO WORKING signature inputs:');
    console.log('  Method:', method);
    console.log('  URL (path only):', url);
    console.log('  Query String:', queryString);
    console.log('  Payload String:', payloadString);
    console.log('  Timestamp:', timestamp);
    
    // Создаем SHA-512 хеш тела запроса (как в официальном примере Python)
    const payloadHash = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(payloadString));
    const hashedPayload = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('🔥 GATE.IO WORKING hashed payload:', hashedPayload);
    
    // ОФИЦИАЛЬНЫЙ ФОРМАТ СТРОКИ ПОДПИСИ ПО ДОКУМЕНТАЦИИ:
    // method + '\n' + url + '\n' + query_string + '\n' + hashed_payload + '\n' + timestamp
    const signatureString = `${method}\n${url}\n${queryString}\n${hashedPayload}\n${timestamp}`;
    
    console.log('🔥 GATE.IO WORKING signature string:');
    console.log(signatureString);
    
    // Создаем HMAC-SHA512 подпись (как в официальном примере)
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
    
    console.log('🔥 GATE.IO WORKING signature result:', result);
    return { signature: result, timestamp };
  } catch (error) {
    console.error('❌ Error creating GATE.IO WORKING signature:', error);
    throw error;
  }
}

// 🔥 РАБОЧАЯ ФУНКЦИЯ БАЛАНСА ИЗ WORKING_FUNDING
async function getGateBalanceWorking(apiKey: any) {
  try {
    console.log('🔥 GATE.IO WORKING: Processing balance request');
    
    // ОФИЦИАЛЬНЫЕ БАЗОВЫЕ URL ПО ДОКУМЕНТАЦИИ
    const GATE_API_BASE = 'https://api.gateio.ws';
    const GATE_TESTNET_BASE = 'https://fx-api-testnet.gateio.ws';
    
    const baseUrl = apiKey.is_testnet ? GATE_TESTNET_BASE : GATE_API_BASE;
    const prefix = '/api/v4';
    const url = '/futures/usdt/accounts';  // Только путь для подписи (как в официальном примере)
    const queryString = '';
    const payloadString = '';
    
    console.log('🔥 GATE.IO WORKING: Base URL:', baseUrl);
    console.log('🔥 GATE.IO WORKING: Prefix:', prefix);
    console.log('🔥 GATE.IO WORKING: URL path:', url);
    console.log('🔥 GATE.IO WORKING: Full URL:', baseUrl + prefix + url);
    
    // Создаем подпись по официальному примеру
    const { signature, timestamp } = await createCompleteGateSignature(apiKey.api_secret, 'GET', prefix + url, queryString, payloadString);
    
    const fullUrl = baseUrl + prefix + url;
    console.log('🔥 GATE.IO WORKING balance request URL:', fullUrl);
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'KEY': apiKey.api_key,
        'SIGN': signature,
        'Timestamp': timestamp,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('🔥 GATE.IO WORKING balance response status:', response.status);
    console.log('🔥 GATE.IO WORKING balance response:', data);

    if (response.status !== 200) {
      console.log('❌ GATE.IO WORKING API Error:', {
        status: response.status,
        error: data
      });
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            available_balance: "0.00",
            currency: "USDT",
            status: "❌ ОШИБКА API",
            exchange: "GATE.IO",
            note: `Ошибка API: ${data.message || 'Unknown error'} (Code: ${response.status})`,
            setup_required: true,
            debug_info: {
              status: response.status,
              error: data,
              signature_used: signature.substring(0, 20) + '...',
              timestamp_used: timestamp
            }
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ GATE.IO WORKING: Баланс получен успешно');
    
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
            total_balance: data.total || "0.00",
            api_version: "GATE_V4_WORKING",
            signature_working: true
          }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE.IO WORKING Balance Error:', error.message);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          available_balance: "0.00",
          currency: "USDT",
          status: "❌ ОШИБКА",
          exchange: "GATE.IO",
          note: `Ошибка: ${error.message}`,
          setup_required: true
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}