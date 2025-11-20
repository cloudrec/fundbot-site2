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
    console.log('🎭 DEMO Function started - using mock data');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🎭 Request body:', requestBody);
    
    const { action, user_id }: TradingRequest = requestBody;
    
    console.log('🎭 Trading action:', action, 'for user:', user_id);

    if (!user_id) {
      throw new Error('user_id is required');
    }

    let result;

    // Получаем настройки пользователя для определения биржи
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    const exchange = settings?.exchange || 'binance';
    console.log('🎭 Using exchange:', exchange);

    switch (action) {
      case 'get_balance':
        result = getDemoBalance(exchange);
        break;
      case 'get_positions':
        result = getDemoPositions(exchange);
        break;
      case 'place_test_order':
        result = getDemoTestOrder(exchange);
        break;
      case 'place_order_with_tp_sl':
        result = getDemoOrderWithTPSL(exchange);
        break;
      case 'cancel_all_orders':
      case 'cancel_orders':
        result = getDemoCancelOrders(exchange);
        break;
      case 'close_all_positions':
      case 'close_positions':
        result = getDemoClosePositions(exchange);
        break;
      case 'scan_funding':
        result = getDemoFundingScan();
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ DEMO Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Демо баланс
function getDemoBalance(exchange: string) {
  console.log('🎭 Getting demo balance for:', exchange);
  
  const balances = {
    binance: {
      available_balance: '1,234.56',
      currency: 'USDT',
      status: 'DEMO MODE 🎭',
      exchange: 'BINANCE'
    },
    bybit: {
      available_balance: '2,567.89',
      currency: 'USDT',
      status: 'DEMO MODE 🎭',
      exchange: 'BYBIT'
    },
    gate: {
      available_balance: '3,890.12',
      currency: 'USDT',
      status: 'DEMO MODE 🎭',
      exchange: 'GATE'
    },
    okx: {
      available_balance: '4,123.45',
      currency: 'USDT',
      status: 'DEMO MODE 🎭',
      exchange: 'OKX'
    },
    kucoin: {
      available_balance: '5,678.90',
      currency: 'USDT',
      status: 'DEMO MODE 🎭',
      exchange: 'KUCOIN'
    }
  };

  return balances[exchange as keyof typeof balances] || balances.binance;
}

// Демо позиции
function getDemoPositions(exchange: string) {
  console.log('🎭 Getting demo positions for:', exchange);
  
  const positions = [
    {
      symbol: 'BTCUSDT',
      side: 'LONG',
      size: 0.5,
      entry_price: 43250.00,
      mark_price: 43890.50,
      pnl: 320.25,
      percentage: 1.48
    },
    {
      symbol: 'ETHUSDT',
      side: 'SHORT',
      size: 2.3,
      entry_price: 2650.00,
      mark_price: 2598.75,
      pnl: 117.88,
      percentage: 1.93
    },
    {
      symbol: 'SUPERUSDT',
      side: 'LONG',
      size: 1000,
      entry_price: 1.25,
      mark_price: 1.31,
      pnl: 60.00,
      percentage: 4.80
    }
  ];
  
  return {
    positions: positions,
    total_positions: positions.length,
    exchange: exchange.toUpperCase(),
    status: 'DEMO MODE 🎭'
  };
}

// Демо тестовый ордер
function getDemoTestOrder(exchange: string) {
  console.log('🎭 Placing demo test order for:', exchange);
  
  return {
    message: `DEMO: Тестовый ордер на ${exchange.toUpperCase()}`,
    exchange: exchange.toUpperCase(),
    symbol: 'SUPERUSDT',
    amount: 10,
    leverage: 11,
    status: 'DEMO MODE 🎭'
  };
}

// Демо ордер с TP/SL
function getDemoOrderWithTPSL(exchange: string) {
  console.log('🎭 Placing demo order with TP/SL for:', exchange);
  
  const orderId = `DEMO_${Date.now()}`;
  
  return {
    order_id: orderId,
    symbol: 'SUPERUSDT',
    side: 'BUY',
    status: 'FILLED',
    message: `DEMO: Ордер с TP/SL размещен на ${exchange.toUpperCase()}: ${orderId}`,
    quantity: '8',
    price: 1.25,
    tp_price: '1.31',
    sl_price: '1.19',
    exchange: exchange.toUpperCase(),
    note: 'DEMO MODE 🎭'
  };
}

// Демо отмена ордеров
function getDemoCancelOrders(exchange: string) {
  console.log('🎭 Demo cancelling orders for:', exchange);
  
  return {
    message: `DEMO: Отмена ордеров на ${exchange.toUpperCase()}`,
    cancelled_orders: 3,
    exchange: exchange.toUpperCase(),
    status: 'DEMO MODE 🎭'
  };
}

// Демо закрытие позиций
function getDemoClosePositions(exchange: string) {
  console.log('🎭 Demo closing positions for:', exchange);
  
  return {
    message: `DEMO: Закрытие позиций на ${exchange.toUpperCase()}`,
    closed_positions: 2,
    total_pnl: '+497.13 USDT',
    exchange: exchange.toUpperCase(),
    status: 'DEMO MODE 🎭'
  };
}

// Демо сканирование фандинга
function getDemoFundingScan() {
  console.log('🎭 Demo funding scan');
  
  const opportunities = [
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
    },
    {
      exchange: 'okx',
      symbol: 'ADAUSDT',
      funding_rate: 0.00015,
      next_funding_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      apy_estimate: 1.314,
      status: 'active'
    },
    {
      exchange: 'kucoin',
      symbol: 'SOLUSDT',
      funding_rate: -0.00025,
      next_funding_time: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString(),
      apy_estimate: -2.190,
      status: 'active'
    }
  ];

  return {
    message: 'DEMO: Фандинг сканирование выполнено',
    opportunities: opportunities,
    new_opportunities: opportunities.length,
    status: 'DEMO MODE 🎭',
    scan_time: new Date().toISOString(),
    note: 'Демонстрационные данные для показа интерфейса'
  };
}