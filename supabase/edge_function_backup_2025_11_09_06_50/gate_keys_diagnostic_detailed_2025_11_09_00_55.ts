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
    
    console.log('🔍 GATE.IO KEYS DIAGNOSTIC: Starting detailed analysis for user:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем email пользователя
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData.user?.email;
    
    console.log('👤 GATE.IO KEYS DIAGNOSTIC: User info:', { user_id, userEmail });

    // Ищем ключи в api_keys_dev
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    console.log('🔑 GATE.IO KEYS DIAGNOSTIC: Search result:', { found: !!apiKeys, error: keysError?.message });

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Gate.io API ключи не найдены в базе данных',
          details: {
            search_method: 'UUID',
            user_id: user_id,
            table: 'api_keys_dev',
            error: keysError?.message
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Детальный анализ ключей
    const keyAnalysis = {
      api_key: {
        value: apiKeys.api_key,
        length: apiKeys.api_key?.length || 0,
        first_chars: apiKeys.api_key?.substring(0, 10) || 'N/A',
        last_chars: apiKeys.api_key?.substring(-10) || 'N/A',
        contains_special: /[^a-zA-Z0-9]/.test(apiKeys.api_key || ''),
        is_hex: /^[a-fA-F0-9]+$/.test(apiKeys.api_key || ''),
        is_base64_like: /^[A-Za-z0-9+/=]+$/.test(apiKeys.api_key || '')
      },
      api_secret: {
        value: '***HIDDEN***',
        length: apiKeys.api_secret?.length || 0,
        first_chars: apiKeys.api_secret?.substring(0, 10) || 'N/A',
        last_chars: apiKeys.api_secret?.substring(-10) || 'N/A',
        contains_special: /[^a-zA-Z0-9]/.test(apiKeys.api_secret || ''),
        is_hex: /^[a-fA-F0-9]+$/.test(apiKeys.api_secret || ''),
        is_base64_like: /^[A-Za-z0-9+/=]+$/.test(apiKeys.api_secret || '')
      },
      metadata: {
        user_id: apiKeys.user_id,
        exchange: apiKeys.exchange,
        is_testnet: apiKeys.is_testnet,
        has_passphrase: apiKeys.has_passphrase,
        created_at: apiKeys.created_at,
        updated_at: apiKeys.updated_at
      }
    };

    console.log('🔍 GATE.IO KEYS DIAGNOSTIC: Key analysis:', keyAnalysis);

    // Проверим формат ключей Gate.io
    const gateKeyValidation = {
      api_key_format: {
        expected_length: '32 символа (обычно)',
        actual_length: keyAnalysis.api_key.length,
        format_check: keyAnalysis.api_key.is_hex ? 'HEX' : keyAnalysis.api_key.is_base64_like ? 'BASE64-like' : 'UNKNOWN',
        valid_length: keyAnalysis.api_key.length >= 20 && keyAnalysis.api_key.length <= 64
      },
      api_secret_format: {
        expected_length: '64 символа (обычно)',
        actual_length: keyAnalysis.api_secret.length,
        format_check: keyAnalysis.api_secret.is_hex ? 'HEX' : keyAnalysis.api_secret.is_base64_like ? 'BASE64-like' : 'UNKNOWN',
        valid_length: keyAnalysis.api_secret.length >= 40 && keyAnalysis.api_secret.length <= 128
      }
    };

    console.log('✅ GATE.IO KEYS DIAGNOSTIC: Validation results:', gateKeyValidation);

    // Тестируем подпись с этими ключами
    const signatureTest = await testGateSignature(apiKeys.api_key, apiKeys.api_secret);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Детальная диагностика ключей Gate.io завершена',
        user_info: {
          user_id: user_id,
          email: userEmail
        },
        key_analysis: keyAnalysis,
        validation: gateKeyValidation,
        signature_test: signatureTest,
        recommendations: generateRecommendations(keyAnalysis, gateKeyValidation, signatureTest)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE.IO KEYS DIAGNOSTIC Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Тестирование подписи
async function testGateSignature(apiKey: string, apiSecret: string) {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/accounts';
    const queryString = '';
    const body = '';

    // Простая подпись как в рабочей версии
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
    const result = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      success: true,
      signature_length: result.length,
      signature_preview: result.substring(0, 20) + '...',
      message_for_signature: message,
      timestamp_used: timestamp,
      algorithm: 'HMAC-SHA512'
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Генерация рекомендаций
function generateRecommendations(keyAnalysis: any, validation: any, signatureTest: any) {
  const recommendations = [];

  if (!validation.api_key_format.valid_length) {
    recommendations.push('⚠️ API Key имеет необычную длину. Проверьте правильность ключа.');
  }

  if (!validation.api_secret_format.valid_length) {
    recommendations.push('⚠️ API Secret имеет необычную длину. Проверьте правильность секрета.');
  }

  if (keyAnalysis.api_key.contains_special || keyAnalysis.api_secret.contains_special) {
    recommendations.push('⚠️ Ключи содержат специальные символы. Убедитесь что они скопированы корректно.');
  }

  if (!signatureTest.success) {
    recommendations.push('❌ Ошибка создания подписи. Проверьте формат API Secret.');
  }

  if (keyAnalysis.metadata.is_testnet) {
    recommendations.push('🧪 Используются тестовые ключи. Для реальной торговли нужны боевые ключи.');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Ключи выглядят корректно. Проблема может быть в настройках API на Gate.io.');
  }

  return recommendations;
}