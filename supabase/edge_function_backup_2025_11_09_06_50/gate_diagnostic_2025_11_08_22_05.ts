import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    console.log('🔍 GATE.IO DIAGNOSTIC: Checking API keys...');

    // Проверяем все переменные окружения
    const allEnvVars = Deno.env.toObject();
    const gateKeys = Object.keys(allEnvVars).filter(key => key.includes('GATE'));
    
    console.log('🔍 All GATE-related env vars:', gateKeys);
    
    // Проверяем конкретные ключи
    const gateApiKey = Deno.env.get('GATE_API_KEY');
    const gateApiSecret = Deno.env.get('GATE_API_SECRET');
    
    console.log('🔍 GATE_API_KEY exists:', !!gateApiKey);
    console.log('🔍 GATE_API_SECRET exists:', !!gateApiSecret);
    
    if (gateApiKey) {
      console.log('🔍 GATE_API_KEY length:', gateApiKey.length);
      console.log('🔍 GATE_API_KEY first 10 chars:', gateApiKey.substring(0, 10));
    }
    
    if (gateApiSecret) {
      console.log('🔍 GATE_API_SECRET length:', gateApiSecret.length);
      console.log('🔍 GATE_API_SECRET first 10 chars:', gateApiSecret.substring(0, 10));
    }

    // Проверяем другие ключи для сравнения
    const binanceKey = Deno.env.get('BINANCE_API_KEY');
    const bybitKey = Deno.env.get('BYBIT_API_KEY');
    
    console.log('🔍 BINANCE_API_KEY exists:', !!binanceKey);
    console.log('🔍 BYBIT_API_KEY exists:', !!bybitKey);

    const result = {
      gate_api_key_exists: !!gateApiKey,
      gate_api_secret_exists: !!gateApiSecret,
      gate_api_key_length: gateApiKey?.length || 0,
      gate_api_secret_length: gateApiSecret?.length || 0,
      all_gate_env_vars: gateKeys,
      binance_key_exists: !!binanceKey,
      bybit_key_exists: !!bybitKey,
      timestamp: new Date().toISOString()
    };

    return new Response(
      JSON.stringify({ 
        success: true, 
        diagnostic: result,
        message: gateApiKey && gateApiSecret ? 
          '✅ Gate.io API ключи найдены!' : 
          '❌ Gate.io API ключи НЕ найдены в Supabase secrets'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ DIAGNOSTIC Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});