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
    console.log('🔥 SIMPLE DEMO Function started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🔥 Request body:', requestBody);
    
    const { action, user_id }: TradingRequest = requestBody;
    
    console.log('🔥 Trading action:', action, 'for user:', user_id);

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // Получаем настройки пользователя
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settings) {
      console.log('❌ Trading settings not found:', settingsError);
      throw new Error('Trading settings not found for user');
    }

    console.log('✅ User settings loaded:', { exchange: settings.exchange, symbol: `${settings.base_asset}${settings.quote_asset}` });

    let result;

    switch (action) {
      case 'get_balance':
        result = {
          available_balance: '0.00',
          currency: 'USDT',
          status: 'DEMO MODE - Добавьте API ключи',
          message: 'Для получения реального баланса добавьте API ключи в настройках',
          exchange: settings.exchange
        };
        break;

      case 'get_positions':
        result = {
          positions: [],
          total_positions: 0,
          message: 'DEMO MODE - Добавьте API ключи для просмотра позиций',
          exchange: settings.exchange
        };
        break;

      case 'place_test_order':
        result = {
          message: 'DEMO MODE: Тестовый ордер симуляция',
          exchange: settings.exchange,
          symbol: `${settings.base_asset}${settings.quote_asset}`,
          amount: settings.order_amount_usd,
          leverage: settings.leverage,
          status: 'DEMO_MODE'
        };
        break;

      case 'place_order_with_tp_sl':
        result = {
          order_id: 'DEMO_' + Date.now(),
          symbol: `${settings.base_asset}${settings.quote_asset}`,
          side: "BUY",
          status: 'DEMO',
          message: `DEMO MODE: Ордер симуляция на ${settings.exchange}`,
          quantity: '10',
          price: 1.0,
          tp_price: '1.01',
          sl_price: '0.99',
          exchange: settings.exchange.toUpperCase(),
          note: 'Добавьте API ключи для реальной торговли'
        };
        break;

      case 'cancel_all_orders':
      case 'cancel_orders':
        result = {
          message: `DEMO MODE: Отмена ордеров на ${settings.exchange}`,
          exchange: settings.exchange,
          cancelled_orders: 0
        };
        break;

      case 'close_all_positions':
      case 'close_positions':
        result = {
          message: `DEMO MODE: Закрытие позиций на ${settings.exchange}`,
          exchange: settings.exchange,
          closed_positions: 0
        };
        break;

      case 'scan_funding':
        // Получаем существующие возможности фандинга
        const { data: existingOpportunities, error } = await supabase
          .from('funding_opportunities')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        const mockOpportunities = [
          {
            exchange: 'binance',
            symbol: 'BTCUSDT',
            funding_rate: 0.0001,
            next_funding_time: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
            apy_estimate: 1.095,
            status: 'active'
          },
          {
            exchange: 'bybit', 
            symbol: 'ETHUSDT',
            funding_rate: -0.0002,
            next_funding_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            apy_estimate: -0.584,
            status: 'active'
          },
          {
            exchange: 'gate',
            symbol: 'SUPERUSDT',
            funding_rate: 0.0003,
            next_funding_time: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            apy_estimate: 2.628,
            status: 'active'
          }
        ];

        result = {
          message: 'DEMO MODE: Фандинг сканирование выполнено',
          opportunities: mockOpportunities,
          existing_count: existingOpportunities?.length || 0,
          new_opportunities: mockOpportunities.length,
          status: 'SCANNED',
          scan_time: new Date().toISOString(),
          note: 'Добавьте API ключи для реального сканирования'
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ SIMPLE DEMO Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});