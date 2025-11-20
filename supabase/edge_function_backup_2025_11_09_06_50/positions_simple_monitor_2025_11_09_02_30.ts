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
    
    console.log('📊 SIMPLE POSITIONS: Getting positions for user:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем настройки пользователя
    const { data: settings } = await supabase
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (!settings) {
      console.log('⚠️ No settings found for user');
      return new Response(
        JSON.stringify({ 
          success: true, 
          positions: [],
          total_positions: 0,
          message: 'Настройки не найдены'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Получаем позиции с текущей биржи
    const allPositions = [];
    const currentExchange = settings.exchange || 'bybit';

    try {
      let functionName;
      if (currentExchange === 'binance') {
        functionName = 'binance_anti_ban_fixed_2025_11_08_21_20';
      } else if (currentExchange === 'gate') {
        functionName = 'gate_complete_tpsl_working_2025_11_09_02_35';
      } else {
        functionName = 'complete_bybit_all_actions_2025_11_08_14_25';
      }

      console.log(`📊 SIMPLE POSITIONS: Calling ${functionName} for ${currentExchange}`);

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: 'get_positions', user_id: user_id }
      });

      if (error) {
        console.error(`❌ Error from ${functionName}:`, error);
      } else if (data && data.success && data.data && data.data.positions) {
        const positions = data.data.positions;
        console.log(`📊 SIMPLE POSITIONS: Got ${positions.length} positions from ${currentExchange}`);
        
        // Преобразуем позиции в стандартный формат
        positions.forEach((pos: any) => {
          const size = parseFloat(pos.size || pos.qty || 0);
          if (size !== 0) {
            allPositions.push({
              exchange: currentExchange === 'gate' ? 'Gate.io' : currentExchange === 'binance' ? 'Binance' : 'Bybit',
              symbol: pos.contract || pos.symbol || 'Unknown',
              side: size > 0 ? 'LONG' : 'SHORT',
              size: Math.abs(size).toString(),
              entry_price: parseFloat(pos.entry_price || pos.avgPrice || 0),
              mark_price: parseFloat(pos.mark_price || pos.markPrice || pos.entry_price || 0),
              pnl: parseFloat(pos.unrealised_pnl || pos.unrealized_pnl || pos.pnl || 0),
              pnl_percentage: parseFloat(pos.pnl_percentage || pos.percentage || 0),
              margin: parseFloat(pos.margin || pos.initialMargin || 0),
              leverage: pos.leverage || '1'
            });
          }
        });
      }
    } catch (error) {
      console.error(`❌ Error getting positions from ${currentExchange}:`, error);
    }

    console.log('📊 SIMPLE POSITIONS: Total open positions found:', allPositions.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: allPositions,
        total_positions: allPositions.length,
        exchange: currentExchange,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ SIMPLE POSITIONS Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});