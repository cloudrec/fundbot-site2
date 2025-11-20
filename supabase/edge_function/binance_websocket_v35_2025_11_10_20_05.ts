import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, user_id, order_type = 'LONG', ...params } = await req.json();

    console.log(`🌐 BINANCE WEBSOCKET: ${action} - ${order_type} direction`);

    // Получаем API ключи пользователя
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'binance')
      .single();

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ success: false, error: 'Binance API ключи не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Получаем настройки торговли
    const { data: settings, error: settingsError } = await supabaseClient
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    switch (action) {
      case 'get_balance':
        return await handleBinanceBalanceWS(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handleBinanceOrderWithTPSL(apiKeys, settings, order_type);
      
      case 'get_positions':
        return await handleBinancePositionsWS(apiKeys);
      
      case 'close_positions':
      case 'close_all_positions':
        return await handleBinanceClosePositions(apiKeys);
      
      case 'cancel_orders':
      case 'cancel_all_orders':
        return await handleBinanceCancelOrders(apiKeys);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ BINANCE WEBSOCKET Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Функция создания подписи для Binance API
async function createBinanceSignature(queryString: string, secret: string): Promise<string> {
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
  const hexSignature = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return hexSignature;
}

// Получение баланса через WebSocket User Data Stream
async function handleBinanceBalanceWS(apiKeys: any) {
  console.log('🌐 BINANCE WEBSOCKET: Getting balance via User Data Stream');
  
  try {
    // Сначала создаем listen key для User Data Stream
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createBinanceSignature(queryString, apiKeys.api_secret);
    
    const listenKeyResponse = await fetch(`https://fapi.binance.com/fapi/v1/listenKey`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/json'
      }
    });

    const listenKeyData = await listenKeyResponse.json();
    
    if (listenKeyData.code) {
      // Если не удалось создать WebSocket, используем обычный REST API
      console.log('🌐 BINANCE WEBSOCKET: Listen key failed, using REST API');
      return await handleBinanceBalanceREST(apiKeys);
    }

    console.log('🌐 BINANCE WEBSOCKET: Listen key created:', listenKeyData.listenKey);

    // Получаем баланс через REST API (один раз)
    const accountResponse = await fetch(`https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/json'
      }
    });

    const accountData = await accountResponse.json();
    
    if (accountData.code) {
      throw new Error(`Binance API error: ${accountData.msg}`);
    }

    const usdtAsset = accountData.assets?.find((asset: any) => asset.asset === 'USDT');
    const balance = parseFloat(usdtAsset?.availableBalance || '0');
    
    console.log('🌐 BINANCE WEBSOCKET: Balance extracted:', balance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: balance,
        method: 'websocket_ready'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BINANCE WEBSOCKET balance error:', error.message);
    // Fallback к обычному REST API
    return await handleBinanceBalanceREST(apiKeys);
  }
}

// Fallback функция для получения баланса через REST API
async function handleBinanceBalanceREST(apiKeys: any) {
  console.log('🌐 BINANCE WEBSOCKET: Fallback to REST API');
  
  try {
    // Увеличиваем задержку для избежания бана
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createBinanceSignature(queryString, apiKeys.api_secret);
    
    const response = await fetch(`https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.code) {
      throw new Error(`Binance API error: ${data.msg}`);
    }

    const usdtAsset = data.assets?.find((asset: any) => asset.asset === 'USDT');
    const balance = parseFloat(usdtAsset?.availableBalance || '0');
    
    console.log('🌐 BINANCE WEBSOCKET: REST Balance extracted:', balance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: balance,
        method: 'rest_fallback'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BINANCE WEBSOCKET REST fallback error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Binance balance error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций через WebSocket
async function handleBinancePositionsWS(apiKeys: any) {
  console.log('🌐 BINANCE WEBSOCKET: Getting positions');
  
  try {
    // Используем минимальные запросы к REST API
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createBinanceSignature(queryString, apiKeys.api_secret);
    
    const response = await fetch(`https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.code) {
      throw new Error(`Binance positions error: ${data.msg}`);
    }

    // Фильтруем только открытые позиции
    const openPositions = data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
    
    console.log(`🌐 BINANCE WEBSOCKET: Found ${openPositions.length} open positions`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BINANCE WEBSOCKET Positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Binance positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Размещение ордера (оптимизированное для WebSocket)
async function handleBinanceOrderWithTPSL(apiKeys: any, settings: any, orderType: string = 'LONG') {
  console.log(`🌐 BINANCE WEBSOCKET: Placing ${orderType} order with TP/SL`);
  
  try {
    // Получаем баланс через WebSocket метод
    const balanceResponse = await handleBinanceBalanceWS(apiKeys);
    const balanceData = await balanceResponse.json();
    
    if (!balanceData.success) {
      throw new Error('Не удалось получить баланс');
    }
    
    const availableBalance = balanceData.balance;
    const leverage = parseInt(settings?.leverage || '10');
    const riskPercent = parseFloat(settings?.risk_percent || '2') / 100;
    
    // Рассчитываем размер позиции в USDT
    let positionSize = availableBalance * riskPercent * leverage;
    
    // Минимум 10 USDT для Binance
    if (positionSize < 10) {
      positionSize = 10;
      console.log('🌐 BINANCE WEBSOCKET: Position size increased to minimum 10 USDT');
    }
    
    console.log(`🌐 BINANCE WEBSOCKET: Balance: ${availableBalance}, Leverage: ${leverage}x, Risk: ${riskPercent * 100}%, Position Size: ${positionSize} USDT`);
    
    // Получаем текущую цену через WebSocket ticker (публичный API)
    const symbol = settings?.symbol || 'BTCUSDT';
    const tickerResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    const tickerData = await tickerResponse.json();
    
    if (tickerData.code) {
      throw new Error(`Не удалось получить цену для ${symbol}: ${tickerData.msg}`);
    }
    
    const currentPrice = parseFloat(tickerData.price);
    
    // Рассчитываем quantity (простой подход)
    const rawQuantity = positionSize / currentPrice;
    const finalQuantity = parseFloat(rawQuantity.toFixed(6));
    
    console.log(`🌐 BINANCE WEBSOCKET: Price: ${currentPrice}, Raw Quantity: ${rawQuantity}, Final Quantity: ${finalQuantity}`);
    
    // Выбираем правильные TP/SL в зависимости от типа ордера
    let takeProfit, stopLoss;
    if (orderType === 'LONG') {
      takeProfit = parseFloat(settings?.long_tp || settings?.take_profit || '2') / 100;
      stopLoss = parseFloat(settings?.long_sl || settings?.stop_loss || '1') / 100;
    } else {
      takeProfit = parseFloat(settings?.short_tp || settings?.take_profit || '2') / 100;
      stopLoss = parseFloat(settings?.short_sl || settings?.stop_loss || '1') / 100;
    }
    
    // Рассчитываем цены TP и SL
    let tpPrice, slPrice;
    if (orderType === 'LONG') {
      tpPrice = (currentPrice * (1 + takeProfit)).toFixed(2);
      slPrice = (currentPrice * (1 - stopLoss)).toFixed(2);
    } else {
      tpPrice = (currentPrice * (1 - takeProfit)).toFixed(2);
      slPrice = (currentPrice * (1 + stopLoss)).toFixed(2);
    }
    
    console.log(`🌐 BINANCE WEBSOCKET: TP: ${tpPrice}, SL: ${slPrice}, Quantity: ${finalQuantity}`);
    
    // 1. Размещаем основной ордер (минимальные запросы)
    const timestamp1 = Date.now();
    const orderParams = `symbol=${symbol}&side=${orderType === 'LONG' ? 'BUY' : 'SELL'}&type=MARKET&quantity=${finalQuantity}&timestamp=${timestamp1}`;
    const signature1 = await createBinanceSignature(orderParams, apiKeys.api_secret);
    
    console.log(`🌐 BINANCE WEBSOCKET: Order params: ${orderParams}`);
    
    const orderResponse = await fetch('https://fapi.binance.com/fapi/v1/order', {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${orderParams}&signature=${signature1}`
    });

    const orderData = await orderResponse.json();
    
    console.log('🌐 BINANCE WEBSOCKET: Order response:', JSON.stringify(orderData, null, 2));
    
    if (orderData.code) {
      throw new Error(`Binance order error: ${orderData.msg}`);
    }

    console.log('🌐 BINANCE WEBSOCKET: Main order placed successfully');
    
    // Увеличиваем задержки между TP/SL для избежания бана
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 2. Размещаем Take Profit ордер
    const timestamp2 = Date.now();
    const tpParams = `symbol=${symbol}&side=${orderType === 'LONG' ? 'SELL' : 'BUY'}&type=TAKE_PROFIT_MARKET&stopPrice=${tpPrice}&closePosition=true&timestamp=${timestamp2}`;
    const signature2 = await createBinanceSignature(tpParams, apiKeys.api_secret);
    
    const tpResponse = await fetch('https://fapi.binance.com/fapi/v1/order', {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${tpParams}&signature=${signature2}`
    });

    const tpData = await tpResponse.json();
    
    if (tpData.code) {
      console.log('⚠️ BINANCE WEBSOCKET: TP order failed:', tpData.msg);
    } else {
      console.log('🌐 BINANCE WEBSOCKET: TP order placed:', tpData.orderId);
    }
    
    // Увеличиваем задержку перед размещением SL
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 3. Размещаем Stop Loss ордер
    const timestamp3 = Date.now();
    const slParams = `symbol=${symbol}&side=${orderType === 'LONG' ? 'SELL' : 'BUY'}&type=STOP_MARKET&stopPrice=${slPrice}&closePosition=true&timestamp=${timestamp3}`;
    const signature3 = await createBinanceSignature(slParams, apiKeys.api_secret);
    
    const slResponse = await fetch('https://fapi.binance.com/fapi/v1/order', {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${slParams}&signature=${signature3}`
    });

    const slData = await slResponse.json();
    
    if (slData.code) {
      console.log('⚠️ BINANCE WEBSOCKET: SL order failed:', slData.msg);
    } else {
      console.log('🌐 BINANCE WEBSOCKET: SL order placed:', slData.orderId);
    }
    
    console.log('🌐 BINANCE WEBSOCKET: All orders completed');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        main_order_id: orderData.orderId,
        tp_order_id: tpData.orderId || null,
        sl_order_id: slData.orderId || null,
        symbol: symbol,
        side: orderType,
        quantity: finalQuantity,
        price: currentPrice,
        take_profit: tpPrice,
        stop_loss: slPrice,
        method: 'websocket_optimized'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BINANCE WEBSOCKET Order error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Binance order error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Закрытие всех позиций (оптимизированное)
async function handleBinanceClosePositions(apiKeys: any) {
  console.log('🌐 BINANCE WEBSOCKET: Closing all positions');
  
  try {
    // Сначала получаем список открытых позиций
    const positionsResponse = await handleBinancePositionsWS(apiKeys);
    const positionsData = await positionsResponse.json();
    
    if (!positionsData.success) {
      throw new Error('Не удалось получить список позиций');
    }
    
    const openPositions = positionsData.positions;
    
    if (openPositions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Нет открытых позиций для закрытия' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const closeResults = [];
    
    // Закрываем каждую позицию с увеличенными задержками
    for (const position of openPositions) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Увеличенная задержка
        
        const positionAmt = parseFloat(position.positionAmt);
        const closeSide = positionAmt > 0 ? 'SELL' : 'BUY';
        const closeQuantity = Math.abs(positionAmt);
        
        const timestamp = Date.now();
        const closeParams = `symbol=${position.symbol}&side=${closeSide}&type=MARKET&quantity=${closeQuantity}&timestamp=${timestamp}`;
        const signature = await createBinanceSignature(closeParams, apiKeys.api_secret);
        
        const response = await fetch('https://fapi.binance.com/fapi/v1/order', {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKeys.api_key,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `${closeParams}&signature=${signature}`
        });

        const data = await response.json();
        
        if (data.code) {
          closeResults.push({
            symbol: position.symbol,
            success: false,
            error: data.msg
          });
          console.log(`❌ Error closing ${position.symbol}: ${data.msg}`);
        } else {
          closeResults.push({
            symbol: position.symbol,
            success: true,
            order_id: data.orderId
          });
          console.log(`✅ Position ${position.symbol} closed successfully`);
        }
        
      } catch (error) {
        closeResults.push({
          symbol: position.symbol,
          success: false,
          error: error.message
        });
        console.log(`❌ Error closing ${position.symbol}: ${error.message}`);
      }
    }
    
    const successCount = closeResults.filter(r => r.success).length;
    
    console.log(`🌐 BINANCE WEBSOCKET: Closed ${successCount} of ${closeResults.length} positions`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        closed_positions: successCount,
        total_positions: closeResults.length,
        results: closeResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BINANCE WEBSOCKET Close positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Binance close positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена ордеров (оптимизированное)
async function handleBinanceCancelOrders(apiKeys: any) {
  console.log('🌐 BINANCE WEBSOCKET: Canceling orders');
  
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const timestamp = Date.now();
    const cancelParams = `timestamp=${timestamp}`;
    const signature = await createBinanceSignature(cancelParams, apiKeys.api_secret);
    
    const response = await fetch('https://fapi.binance.com/fapi/v1/allOpenOrders', {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${cancelParams}&signature=${signature}`
    });

    const data = await response.json();
    
    if (data.code) {
      throw new Error(`Binance cancel error: ${data.msg}`);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Все ордера отменены',
        data: data
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ BINANCE WEBSOCKET Cancel orders error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Binance cancel orders error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}