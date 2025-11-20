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
    
    console.log('🎯 GATE.IO SIMPLE: Action:', action, 'User:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем email пользователя
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData.user?.email;
    
    console.log('👤 GATE.IO SIMPLE: User info:', { user_id, userEmail });

    // Ищем в правильной таблице api_keys_dev
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    console.log('🔑 GATE.IO SIMPLE: Поиск по UUID:', { found: !!apiKeys, error: keysError?.message });

    let finalKeys = apiKeys;

    // Если не нашли по UUID, пробуем по email
    if (keysError || !apiKeys) {
      console.log('🔍 GATE.IO SIMPLE: Пробуем по email...');
      
      if (userEmail) {
        const { data: emailKeys, error: emailError } = await supabase
          .from('api_keys_dev')
          .select('*')
          .eq('user_id', userEmail)
          .eq('exchange', 'gate')
          .single();

        console.log('🔑 GATE.IO SIMPLE: Поиск по email:', { found: !!emailKeys, error: emailError?.message });
        
        if (emailKeys && !emailError) {
          finalKeys = emailKeys;
        }
      }
    }

    if (!finalKeys) {
      console.log('❌ GATE.IO SIMPLE: API ключи не найдены');
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

    console.log('✅ GATE.IO SIMPLE: Ключи найдены, выполняем действие:', action);

    if (action === 'get_balance') {
      return await getGateBalanceSimple(finalKeys);
    }

    throw new Error(`Неизвестное действие: ${action}`);

  } catch (error) {
    console.error('❌ GATE.IO SIMPLE Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// 🎯 ПРОСТАЯ ПОДПИСЬ ИЗ РАБОЧЕЙ ФУНКЦИИ (БЕЗ ХЕШИРОВАНИЯ BODY)
async function generateGateSignatureSimple(method: string, url: string, queryString: string, body: string, timestamp: string, apiSecret: string) {
  // ПРОСТОЙ ФОРМАТ: method + '\n' + url + '\n' + query_string + '\n' + body + '\n' + timestamp
  const message = `${method}\n${url}\n${queryString}\n${body}\n${timestamp}`;
  
  console.log('🎯 GATE.IO SIMPLE signature inputs:');
  console.log('  Method:', method);
  console.log('  URL:', url);
  console.log('  Query String:', queryString);
  console.log('  Body:', body);
  console.log('  Timestamp:', timestamp);
  console.log('  Message for signature:', message);
  
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
  const result = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
    
  console.log('🎯 GATE.IO SIMPLE signature result:', result);
  return result;
}

// 🎯 ПРОСТАЯ ФУНКЦИЯ БАЛАНСА ИЗ РАБОЧЕЙ ВЕРСИИ
async function getGateBalanceSimple(apiKey: any) {
  try {
    console.log('🎯 GATE.IO SIMPLE: Processing balance request');
    
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/accounts';
    const queryString = '';
    const body = '';

    console.log('🎯 GATE.IO SIMPLE: Request details:');
    console.log('  Base URL: https://api.gateio.ws');
    console.log('  Full URL: https://api.gateio.ws' + url);
    console.log('  Method:', method);
    console.log('  Timestamp:', timestamp);

    const signature = await generateGateSignatureSimple(method, url, queryString, body, timestamp, apiKey.api_secret);

    const response = await fetch(`https://api.gateio.ws${url}`, {
      method: method,
      headers: {
        'KEY': apiKey.api_key,
        'Timestamp': timestamp,
        'SIGN': signature,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('🎯 GATE.IO SIMPLE balance response status:', response.status);
    console.log('🎯 GATE.IO SIMPLE balance response:', data);

    if (response.status !== 200) {
      console.log('❌ GATE.IO SIMPLE API Error:', {
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
              timestamp_used: timestamp,
              algorithm: "SIMPLE_NO_HASH"
            }
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ GATE.IO SIMPLE: Баланс получен успешно');
    
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
            api_version: "GATE_SIMPLE_NO_HASH",
            signature_working: true,
            algorithm: "SIMPLE_NO_HASH"
          }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE.IO SIMPLE Balance Error:', error.message);
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