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
    
    console.log('🧪 GATE.IO HEADERS TEST: Starting multiple header variations test');

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

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/accounts';
    const queryString = '';
    const body = '';
    const message = `${method}\n${url}\n${queryString}\n${body}\n${timestamp}`;

    // Создаем подпись
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiKeys.api_secret);
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

    console.log('🧪 GATE.IO HEADERS TEST: Signature created:', result.substring(0, 20) + '...');

    // Тестируем разные варианты заголовков
    const testVariations = [
      {
        name: 'Standard Headers',
        headers: {
          'KEY': apiKeys.api_key,
          'Timestamp': timestamp,
          'SIGN': result,
          'Content-Type': 'application/json'
        }
      },
      {
        name: 'With Accept Header',
        headers: {
          'KEY': apiKeys.api_key,
          'Timestamp': timestamp,
          'SIGN': result,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      },
      {
        name: 'With User-Agent',
        headers: {
          'KEY': apiKeys.api_key,
          'Timestamp': timestamp,
          'SIGN': result,
          'Content-Type': 'application/json',
          'User-Agent': 'Gate.io-API-Client/1.0'
        }
      },
      {
        name: 'Lowercase Headers',
        headers: {
          'key': apiKeys.api_key,
          'timestamp': timestamp,
          'sign': result,
          'content-type': 'application/json'
        }
      },
      {
        name: 'Mixed Case Headers',
        headers: {
          'Key': apiKeys.api_key,
          'TimeStamp': timestamp,
          'Sign': result,
          'Content-Type': 'application/json'
        }
      },
      {
        name: 'With All Headers',
        headers: {
          'KEY': apiKeys.api_key,
          'Timestamp': timestamp,
          'SIGN': result,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Gate.io-API-Client/1.0',
          'Cache-Control': 'no-cache'
        }
      }
    ];

    const results = [];

    for (const variation of testVariations) {
      console.log(`🧪 GATE.IO HEADERS TEST: Testing ${variation.name}...`);
      
      try {
        const response = await fetch(`https://api.gateio.ws${url}`, {
          method: method,
          headers: variation.headers
        });

        const responseText = await response.text();
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          responseData = { raw_response: responseText };
        }

        console.log(`🧪 GATE.IO HEADERS TEST: ${variation.name} - Status: ${response.status}`);
        console.log(`🧪 GATE.IO HEADERS TEST: ${variation.name} - Response:`, responseData);

        results.push({
          name: variation.name,
          status: response.status,
          success: response.status === 200,
          headers_sent: variation.headers,
          response: responseData,
          response_headers: Object.fromEntries(response.headers.entries())
        });

        // Если получили успешный ответ, прерываем тестирование
        if (response.status === 200) {
          console.log(`🎉 GATE.IO HEADERS TEST: SUCCESS with ${variation.name}!`);
          break;
        }

      } catch (error) {
        console.log(`🧪 GATE.IO HEADERS TEST: ${variation.name} - Error:`, error.message);
        results.push({
          name: variation.name,
          success: false,
          error: error.message,
          headers_sent: variation.headers
        });
      }

      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const summary = {
      total_tests: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      working_variation: results.find(r => r.success)?.name || 'None'
    };

    console.log('🧪 GATE.IO HEADERS TEST: Summary:', summary);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Gate.io headers variation test completed',
        summary: summary,
        results: results,
        signature_info: {
          timestamp_used: timestamp,
          message_for_signature: message,
          signature_preview: result.substring(0, 20) + '...',
          api_key_used: apiKeys.api_key
        },
        recommendations: generateRecommendations(results)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE.IO HEADERS TEST Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateRecommendations(results: any[]) {
  const recommendations = [];
  
  const successfulTest = results.find(r => r.success);
  if (successfulTest) {
    recommendations.push(`✅ Используйте заголовки из варианта: ${successfulTest.name}`);
    return recommendations;
  }

  const statusCounts = results.reduce((acc, r) => {
    const status = r.status || 'error';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  if (statusCounts['401'] > 0) {
    recommendations.push('🔑 Все варианты возвращают 401 - проблема в подписи или ключах');
  }
  
  if (statusCounts['400'] > 0) {
    recommendations.push('📝 Некоторые варианты возвращают 400 - проблема в формате запроса');
  }

  if (statusCounts['403'] > 0) {
    recommendations.push('🚫 Некоторые варианты возвращают 403 - проблема в правах доступа');
  }

  recommendations.push('🔍 Попробуйте проверить настройки API ключей на Gate.io');
  
  return recommendations;
}