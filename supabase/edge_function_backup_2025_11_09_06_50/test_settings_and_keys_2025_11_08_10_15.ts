import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface TradingRequest {
  action: 'get_balance' | 'get_positions' | 'place_test_order' | 'place_order_with_tp_sl' | 'cancel_all_orders' | 'cancel_orders' | 'close_all_positions' | 'close_positions' | 'scan_funding';
  user_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🧪 TEST Function started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🧪 Request:', { action: requestBody.action, user_id: requestBody.user_id });
    
    const { action, user_id }: TradingRequest = requestBody;
    
    if (!user_id) {
      throw new Error('user_id is required');
    }

    // Получаем настройки пользователя
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🧪 Settings query result:', {
      has_data: !!settings,
      error: settingsError?.message,
      settings: settings
    });

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Настройки не найдены',
          debug: {
            settingsError: settingsError?.message,
            has_settings: !!settings
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Получаем все API ключи пользователя
    const { data: allApiKeys, error: allApiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id);

    console.log('🧪 All API keys:', {
      count: allApiKeys?.length || 0,
      exchanges: allApiKeys?.map(k => k.exchange) || [],
      error: allApiError?.message
    });

    // Получаем API ключи для выбранной биржи
    const { data: apiKeysArray, error: apiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', settings.exchange)
      .eq('is_active', true);

    console.log('🧪 API keys for selected exchange:', {
      exchange: settings.exchange,
      found_keys: apiKeysArray?.length || 0,
      error: apiError?.message
    });

    const result = {
      settings: {
        exchange: settings.exchange,
        base_asset: settings.base_asset,
        quote_asset: settings.quote_asset,
        order_amount_usd: settings.order_amount_usd,
        leverage: settings.leverage
      },
      all_api_keys: allApiKeys?.map(k => ({
        exchange: k.exchange,
        is_active: k.is_active,
        is_testnet: k.is_testnet,
        api_key_length: k.api_key?.length || 0,
        api_secret_length: k.api_secret?.length || 0
      })) || [],
      selected_exchange_keys: apiKeysArray?.map(k => ({
        exchange: k.exchange,
        is_active: k.is_active,
        is_testnet: k.is_testnet,
        api_key_length: k.api_key?.length || 0,
        api_secret_length: k.api_secret?.length || 0
      })) || [],
      can_proceed: !!(apiKeysArray && apiKeysArray.length > 0),
      message: `TEST: Настройки загружены для ${settings.exchange}`
    };

    console.log('🧪 Final result:', result);

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ TEST Error:', error.message);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        debug: {
          error_type: error.constructor.name,
          error_stack: error.stack
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});