import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, user_id, order_type = 'LONG', ...params } = await req.json();

    console.log(`🧪 TEST FUNCTION: ${action} - ${order_type} direction`);
    console.log(`🧪 TEST FUNCTION: User ID: ${user_id}`);
    console.log(`🧪 TEST FUNCTION: Params:`, JSON.stringify(params, null, 2));

    switch (action) {
      case 'get_balance':
        console.log('🧪 TEST FUNCTION: Returning fake balance');
        return new Response(
          JSON.stringify({ 
            success: true, 
            balance: 1000.50,
            message: 'TEST FUNCTION WORKING - FAKE BALANCE'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      
      case 'place_order_with_tp_sl':
        console.log('🧪 TEST FUNCTION: Returning fake order');
        return new Response(
          JSON.stringify({ 
            success: true, 
            main_order_id: 'TEST_ORDER_123',
            symbol: 'BTCUSDT',
            side: order_type,
            quantity: 0.001,
            price: 89000,
            take_profit: '90000',
            stop_loss: '88000',
            message: 'TEST FUNCTION WORKING - FAKE ORDER'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      
      case 'get_positions':
        console.log('🧪 TEST FUNCTION: Returning fake positions');
        return new Response(
          JSON.stringify({ 
            success: true, 
            positions: [
              {
                symbol: 'BTCUSDT',
                size: '0.001',
                side: 'Buy',
                unrealizedPnl: '10.50'
              }
            ],
            total_positions: 1,
            message: 'TEST FUNCTION WORKING - FAKE POSITIONS'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      
      case 'close_positions':
      case 'close_all_positions':
        console.log('🧪 TEST FUNCTION: Returning fake close');
        return new Response(
          JSON.stringify({ 
            success: true, 
            closed_positions: 1,
            total_positions: 1,
            message: 'TEST FUNCTION WORKING - FAKE CLOSE'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      
      case 'cancel_orders':
      case 'cancel_all_orders':
        console.log('🧪 TEST FUNCTION: Returning fake cancel');
        return new Response(
          JSON.stringify({
            success: true,
            message: 'TEST FUNCTION WORKING - FAKE CANCEL'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      
      default:
        console.log(`🧪 TEST FUNCTION: Unknown action: ${action}`);
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ TEST FUNCTION Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Test function error: ${error.message}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});