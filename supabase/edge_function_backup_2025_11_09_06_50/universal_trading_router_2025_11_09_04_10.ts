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
    
    console.log('🎯 UNIVERSAL: Starting action:', action, 'for user:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем настройки пользователя чтобы определить биржу
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings_dev')
      .select('exchange')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ success: false, error: 'Настройки не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const exchange = settings.exchange;
    console.log('🎯 UNIVERSAL: Exchange from settings:', exchange);

    // Определяем правильную функцию для каждой биржи
    let targetFunction;
    if (exchange === 'binance') {
      targetFunction = 'binance_fixed_anti_ban_2025_11_08_17_30';
    } else if (exchange === 'bybit') {
      targetFunction = 'bybit_complete_all_actions_2025_11_08_19_00';
    } else if (exchange === 'gate') {
      targetFunction = 'gate_live_trading_2025_11_08_21_30';
    } else {
      return new Response(
        JSON.stringify({ success: false, error: `Неподдерживаемая биржа: ${exchange}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🎯 UNIVERSAL: Calling function:', targetFunction);

    // Вызываем правильную функцию
    const response = await supabase.functions.invoke(targetFunction, {
      body: { action, user_id }
    });

    console.log('🎯 UNIVERSAL: Response from', targetFunction, ':', response);

    if (response.error) {
      return new Response(
        JSON.stringify({ success: false, error: response.error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(response.data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ UNIVERSAL Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});