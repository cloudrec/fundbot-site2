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
    
    console.log('🚀 GATE.IO FIXED: Action:', action, 'User:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем email пользователя
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData.user?.email;
    
    console.log('👤 GATE.IO FIXED: User info:', { user_id, userEmail });

    // ИСПРАВЛЕНО: Ищем в правильной таблице api_keys_dev
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    console.log('🔑 GATE.IO FIXED: Поиск по UUID в api_keys_dev:', { found: !!apiKeys, error: keysError?.message });

    let finalKeys = apiKeys;

    // Если не нашли по UUID, пробуем по email
    if (keysError || !apiKeys) {
      console.log('🔍 GATE.IO FIXED: Не нашли по UUID, пробуем по email...');
      
      if (userEmail) {
        const { data: emailKeys, error: emailError } = await supabase
          .from('api_keys_dev')
          .select('*')
          .eq('user_id', userEmail)
          .eq('exchange', 'gate')
          .single();

        console.log('🔑 GATE.IO FIXED: Поиск по email в api_keys_dev:', { found: !!emailKeys, error: emailError?.message });
        
        if (emailKeys && !emailError) {
          finalKeys = emailKeys;
        }
      }
    }

    if (!finalKeys) {
      console.log('❌ GATE.IO FIXED: API ключи не найдены');
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            available_balance: "0.00",
            currency: "USDT",
            status: "🔑 ДОБАВЬТЕ API КЛЮЧИ",
            exchange: "GATE.IO",
            note: "Перейдите на вкладку \"API Ключи\" и добавьте Gate.io ключи",
            setup_required: true,
            table_searched: "api_keys_dev"
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ GATE.IO FIXED: Ключи найдены, выполняем действие:', action);

    if (action === 'get_balance') {
      return await getGateBalance(finalKeys);
    }

    throw new Error(`Неизвестное действие: ${action}`);

  } catch (error) {
    console.error('❌ GATE.IO FIXED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getGateBalance(keys: any) {
  try {
    console.log('💰 GATE.IO FIXED: Получаем баланс...');
    
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/accounts';
    const queryString = '';
    const body = '';

    // Генерируем подпись
    const message = `${method}\n${url}\n${queryString}\n${body}\n${timestamp}`;
    
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

    console.log('🔐 GATE.IO FIXED: Отправляем запрос к API...');

    const response = await fetch(`https://api.gateio.ws${url}`, {
      method: method,
      headers: {
        'KEY': keys.api_key,
        'Timestamp': timestamp,
        'SIGN': signatureHex,
        'Content-Type': 'application/json'
      }
    });

    console.log('📡 GATE.IO FIXED: Ответ API:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ GATE.IO FIXED: Ошибка API:', errorText);
      throw new Error(`Gate.io API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ GATE.IO FIXED: Баланс получен:', data);
    
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
          table_used: "api_keys_dev"
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE.IO FIXED Balance Error:', error.message);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          available_balance: "0.00",
          currency: "USDT",
          status: "❌ ОШИБКА API",
          exchange: "GATE.IO",
          note: `Ошибка: ${error.message}`,
          setup_required: true,
          table_used: "api_keys_dev"
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}