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
    
    console.log('🔵 BYBIT ONLY: Starting action:', action, 'for user:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // СТРОГО ТОЛЬКО BYBIT API КЛЮЧИ
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'bybit')
      .single();

    if (keysError || !apiKeys) {
      console.log('🔵 BYBIT ONLY: No Bybit API keys found');
      return new Response(
        JSON.stringify({ success: false, error: 'Bybit API ключи не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔵 BYBIT ONLY: Bybit API keys loaded successfully');

    // Получаем настройки
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    // Обработка разных действий ТОЛЬКО для Bybit
    switch (action) {
      case 'get_balance':
        return await handleBybitBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handleBybitOrder(apiKeys, settings);
      
      case 'get_positions':
        return await handleBybitPositions(apiKeys);
      
      case 'close_positions':
      case 'close_all_positions':
        return await handleBybitClosePositions(apiKeys);
      
      case 'cancel_orders':
      case 'cancel_all_orders':
        return await handleBybitCancelOrders(apiKeys);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ BYBIT ONLY Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ТОЛЬКО BYBIT БАЛАНС
async function handleBybitBalance(apiKeys: any) {
  console.log('🔵 BYBIT ONLY: Getting Bybit balance');
  
  try {
    const timestamp = Date.now();
    const params = {
      api_key: apiKeys.api_key,
      timestamp: timestamp
    };

    const queryString = new URLSearchParams(params).toString();
    const signature = await createBybitSignature(queryString, apiKeys.api_secret);
    
    const url = `https://api.bybit.com/v5/account/wallet-balance?category=unified&${queryString}&sign=${signature}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok && data.retCode === 0) {
      const usdtBalance = data.result?.list?.[0]?.coin?.find((coin: any) => coin.coin === 'USDT');
      console.log('🔵 BYBIT ONLY: Balance retrieved successfully:', usdtBalance?.availableToWithdraw);
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            available_balance: usdtBalance?.availableToWithdraw || '0.00',
            currency: 'USDT',
            status: 'BYBIT LIVE ✅',
            exchange: 'BYBIT'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('🔵 BYBIT ONLY: Balance error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Bybit balance error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ТОЛЬКО BYBIT ПОЗИЦИИ
async function handleBybitPositions(apiKeys: any) {
  console.log('🔵 BYBIT ONLY: Getting Bybit positions');
  
  try {
    const timestamp = Date.now();
    const params = {
      api_key: apiKeys.api_key,
      category: 'linear',
      timestamp: timestamp
    };

    const queryString = new URLSearchParams(params).toString();
    const signature = await createBybitSignature(queryString, apiKeys.api_secret);
    
    const url = `https://api.bybit.com/v5/position/list?${queryString}&sign=${signature}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok && data.retCode === 0) {
      const activePositions = data.result?.list?.filter((pos: any) => parseFloat(pos.size) > 0) || [];
      console.log('🔵 BYBIT ONLY: Found', activePositions.length, 'active positions');
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            positions: activePositions.map((pos: any) => ({
              symbol: pos.symbol,
              size: pos.size,
              side: pos.side,
              unrealizedPnl: pos.unrealisedPnl,
              markPrice: pos.markPrice,
              avgPrice: pos.avgPrice,
              exchange: 'BYBIT'
            })),
            exchange: 'BYBIT'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      throw new Error(`Bybit positions error: ${data.retMsg || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('🔵 BYBIT ONLY: Positions error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Bybit positions error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ТОЛЬКО BYBIT ОРДЕР
async function handleBybitOrder(apiKeys: any, settings: any) {
  console.log('🔵 BYBIT ONLY: Placing Bybit order');
  
  if (!settings) {
    return new Response(
      JSON.stringify({ success: false, error: 'Настройки не найдены' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const symbol = 'BTCUSDT';
  const qty = '10'; // Фиксированное количество в USD
  
  try {
    const timestamp = Date.now();
    
    // Получаем текущую цену
    const priceResponse = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData.result?.list?.[0]?.lastPrice || '0');
    
    // Рассчитываем TP/SL цены
    const tpPrice = (currentPrice * 1.02).toFixed(2); // +2%
    const slPrice = (currentPrice * 0.98).toFixed(2); // -2%
    
    console.log('🔵 BYBIT ONLY: Calculated prices:', { currentPrice, tpPrice, slPrice });

    const params = {
      api_key: apiKeys.api_key,
      category: 'linear',
      symbol: symbol,
      side: 'Buy',
      orderType: 'Market',
      qty: qty,
      takeProfit: tpPrice,
      stopLoss: slPrice,
      timestamp: timestamp
    };

    const queryString = new URLSearchParams(params).toString();
    const signature = await createBybitSignature(queryString, apiKeys.api_secret);
    
    const response = await fetch('https://api.bybit.com/v5/order/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${queryString}&sign=${signature}`
    });

    const data = await response.json();
    console.log('🔵 BYBIT ONLY: Order response:', data);

    if (response.ok && data.retCode === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            message: `BYBIT ордер размещен: ${symbol}`,
            order_id: data.result?.orderId,
            symbol: symbol,
            quantity: qty,
            current_price: currentPrice,
            tp_price: tpPrice,
            sl_price: slPrice,
            exchange: 'BYBIT'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      throw new Error(`Bybit order error: ${data.retMsg || 'Unknown error'}`);
    }

  } catch (error) {
    console.error('🔵 BYBIT ONLY: Order error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Bybit order error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ТОЛЬКО BYBIT ЗАКРЫТИЕ ПОЗИЦИЙ
async function handleBybitClosePositions(apiKeys: any) {
  console.log('🔵 BYBIT ONLY: Closing Bybit positions');
  
  try {
    // Сначала получаем позиции
    const positionsResult = await handleBybitPositions(apiKeys);
    const positionsData = JSON.parse(await positionsResult.text());
    
    if (!positionsData.success || !positionsData.data.positions) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            message: 'BYBIT позиции закрыты: 0',
            closed_positions: 0,
            exchange: 'BYBIT'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let closedCount = 0;
    const positions = positionsData.data.positions;

    for (const position of positions) {
      try {
        const timestamp = Date.now();
        const params = {
          api_key: apiKeys.api_key,
          category: 'linear',
          symbol: position.symbol,
          side: position.side === 'Buy' ? 'Sell' : 'Buy',
          orderType: 'Market',
          qty: position.size,
          reduceOnly: true,
          timestamp: timestamp
        };

        const queryString = new URLSearchParams(params).toString();
        const signature = await createBybitSignature(queryString, apiKeys.api_secret);
        
        const response = await fetch('https://api.bybit.com/v5/order/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `${queryString}&sign=${signature}`
        });

        const data = await response.json();
        
        if (response.ok && data.retCode === 0) {
          closedCount++;
        }
      } catch (e) {
        console.log('🔵 BYBIT ONLY: Error closing position:', e);
      }
    }

    console.log('🔵 BYBIT ONLY: Closed', closedCount, 'positions');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: `BYBIT позиции закрыты: ${closedCount}`,
          closed_positions: closedCount,
          exchange: 'BYBIT'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('🔵 BYBIT ONLY: Close positions error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Bybit close positions error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ТОЛЬКО BYBIT ОТМЕНА ОРДЕРОВ
async function handleBybitCancelOrders(apiKeys: any) {
  console.log('🔵 BYBIT ONLY: Canceling Bybit orders');
  
  try {
    const timestamp = Date.now();
    const params = {
      api_key: apiKeys.api_key,
      category: 'linear',
      timestamp: timestamp
    };

    const queryString = new URLSearchParams(params).toString();
    const signature = await createBybitSignature(queryString, apiKeys.api_secret);
    
    const response = await fetch('https://api.bybit.com/v5/order/cancel-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${queryString}&sign=${signature}`
    });

    const data = await response.json();
    console.log('🔵 BYBIT ONLY: Cancel orders response:', data);

    if (response.ok && data.retCode === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            message: 'BYBIT ордера отменены',
            cancelled_orders: data.result?.list?.length || 0,
            exchange: 'BYBIT'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      throw new Error(`Bybit cancel orders error: ${data.retMsg || 'Unknown error'}`);
    }

  } catch (error) {
    console.error('🔵 BYBIT ONLY: Cancel orders error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Bybit cancel orders error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Создание подписи для Bybit
async function createBybitSignature(queryString: string, secret: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(queryString);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}