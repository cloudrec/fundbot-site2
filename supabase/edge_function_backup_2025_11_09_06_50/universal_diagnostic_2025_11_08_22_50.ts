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
    
    console.log('🔍 UNIVERSAL DIAGNOSTIC START for user_id:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем информацию о пользователе
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData.user?.email;
    
    console.log('👤 User info:', { user_id, userEmail, found: !!userData.user });

    // Получаем все API ключи по UUID
    const { data: keysByUUID, error: uuidError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', user_id);

    console.log('🔑 Keys by UUID:', { found: keysByUUID?.length || 0, keys: keysByUUID });

    // Получаем все API ключи по email
    let keysByEmail = [];
    if (userEmail) {
      const { data: emailKeys, error: emailError } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', userEmail);
      
      keysByEmail = emailKeys || [];
      console.log('🔑 Keys by email:', { found: keysByEmail.length, keys: keysByEmail });
    }

    // Получаем торговые настройки
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('⚙️ Trading settings:', settings);

    // Анализируем результаты
    const allKeys = [...(keysByUUID || []), ...keysByEmail];
    const uniqueKeys = allKeys.reduce((acc, key) => {
      const keyId = `${key.exchange}_${key.user_id}`;
      if (!acc.find(k => `${k.exchange}_${k.user_id}` === keyId)) {
        acc.push(key);
      }
      return acc;
    }, []);

    const keysByExchange = uniqueKeys.reduce((acc, key) => {
      acc[key.exchange] = key;
      return acc;
    }, {});

    const result = {
      user_info: {
        user_id,
        email: userEmail,
        found: !!userData.user
      },
      api_keys: {
        total_found: uniqueKeys.length,
        by_uuid: keysByUUID?.length || 0,
        by_email: keysByEmail.length,
        exchanges: Object.keys(keysByExchange),
        details: keysByExchange
      },
      trading_settings: {
        found: !!settings,
        current_exchange: settings?.exchange || 'none',
        settings: settings
      },
      diagnosis: {
        has_keys: uniqueKeys.length > 0,
        has_gate_keys: !!keysByExchange.gate,
        has_binance_keys: !!keysByExchange.binance,
        has_bybit_keys: !!keysByExchange.bybit,
        current_exchange_has_keys: settings?.exchange ? !!keysByExchange[settings.exchange] : false
      }
    };

    console.log('🎯 DIAGNOSTIC RESULT:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: result
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