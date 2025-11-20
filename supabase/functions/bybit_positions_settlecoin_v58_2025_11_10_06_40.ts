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

    console.log(`🟦 BYBIT V58 RESTORED: ${action} - ${order_type} direction`);

    // Получаем API ключи пользователя
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'bybit')
      .single();

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bybit API ключи не найдены' }),
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
        return await handleBybitBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handleBybitOrderWithTPSL(apiKeys, settings, order_type);
      
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
    console.error('❌ BYBIT V58 RESTORED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Функция создания подписи для Bybit API
async function createBybitSignature(params: string, secret: string, timestamp: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(timestamp + 'BYBIT_API_KEY' + '5000' + params);
  
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

// Получение баланса Bybit
async function handleBybitBalance(apiKeys: any) {
  console.log('🟦 BYBIT V58 RESTORED: Getting balance');
  
  try {
    const timestamp = Date.now().toString();
    const params = 'accountType=UNIFIED&coin=USDT';
    const signature = await createBybitSignature(params, apiKeys.api_secret, timestamp);
    
    const response = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${params}`, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': '5000',
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }

    const usdtBalance = data.result?.list?.[0]?.coin?.find((c: any) => c.coin === 'USDT');
    const balance = parseFloat(usdtBalance?.availableToWithdraw || '0');
    
    console.log('🟦 BYBIT V58 RESTORED: Balance extracted:', balance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: balance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT V58 RESTORED balance error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit balance error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Размещение ордера с TP/SL (версия v58)
async function handleBybitOrderWithTPSL(apiKeys: any, settings: any, orderType: string = 'LONG') {
  console.log(`🟦 BYBIT V58 RESTORED: Placing ${orderType} order with TP/SL`);
  
  try {
    // Получаем баланс для расчета размера позиции
    const balanceResponse = await handleBybitBalance(apiKeys);
    const balanceData = await balanceResponse.json();
    
    if (!balanceData.success) {
      throw new Error('Не удалось получить баланс');
    }
    
    const availableBalance = balanceData.balance;
    const leverage = parseInt(settings?.leverage || '10');
    const riskPercent = parseFloat(settings?.risk_percent || '2') / 100;
    
    // Рассчитываем размер позиции в USDT
    let positionSize = availableBalance * riskPercent * leverage;
    
    // Минимум 1 USDT для Bybit
    if (positionSize < 1) {
      positionSize = 1;
      console.log('🟦 BYBIT V58 RESTORED: Position size increased to minimum 1 USDT');
    }
    
    console.log(`🟦 BYBIT V58 RESTORED: Balance: ${availableBalance}, Leverage: ${leverage}x, Risk: ${riskPercent * 100}%, Position Size: ${positionSize} USDT`);
    
    // Получаем текущую цену для настроенного символа
    const symbol = settings?.symbol || 'BTCUSDT';
    const tickerResponse = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
    const tickerData = await tickerResponse.json();
    
    if (tickerData.retCode !== 0) {
      throw new Error(`Не удалось получить цену для ${symbol}: ${tickerData.retMsg}`);
    }
    
    const currentPrice = parseFloat(tickerData.result.list[0].lastPrice);
    
    // Рассчитываем quantity
    const rawQuantity = positionSize / currentPrice;
    const finalQuantity = parseFloat(rawQuantity.toFixed(6));
    
    console.log(`🟦 BYBIT V58 RESTORED: Price: ${currentPrice}, Raw Quantity: ${rawQuantity}, Final Quantity: ${finalQuantity}`);
    
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
    
    console.log(`🟦 BYBIT V58 RESTORED: TP: ${tpPrice}, SL: ${slPrice}, Quantity: ${finalQuantity}`);
    
    // 1. Размещаем основной ордер
    const timestamp1 = Date.now().toString();
    const orderParams = JSON.stringify({
      category: 'linear',
      symbol: symbol,
      side: orderType === 'LONG' ? 'Buy' : 'Sell',
      orderType: 'Market',
      qty: finalQuantity.toString(),
      takeProfit: tpPrice,
      stopLoss: slPrice
    });
    
    const signature1 = await createBybitSignature(orderParams, apiKeys.api_secret, timestamp1);
    
    console.log(`🟦 BYBIT V58 RESTORED: Order params: ${orderParams}`);
    
    const orderResponse = await fetch('https://api.bybit.com/v5/order/create', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature1,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp1,
        'X-BAPI-RECV-WINDOW': '5000',
        'Content-Type': 'application/json'
      },
      body: orderParams
    });

    const orderData = await orderResponse.json();
    
    console.log('🟦 BYBIT V58 RESTORED: Order response:', JSON.stringify(orderData, null, 2));
    
    if (orderData.retCode !== 0) {
      throw new Error(`Bybit order error: ${orderData.retMsg}`);
    }

    console.log('🟦 BYBIT V58 RESTORED: Order placed successfully with TP/SL');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: orderData.result.orderId,
        symbol: symbol,
        side: orderType,
        quantity: finalQuantity,
        price: currentPrice,
        take_profit: tpPrice,
        stop_loss: slPrice
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT V58 RESTORED Order error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit order error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций
async function handleBybitPositions(apiKeys: any) {
  console.log('🟦 BYBIT V58 RESTORED: Getting positions');
  
  try {
    const timestamp = Date.now().toString();
    const params = 'category=linear&settleCoin=USDT';
    const signature = await createBybitSignature(params, apiKeys.api_secret, timestamp);
    
    const response = await fetch(`https://api.bybit.com/v5/position/list?${params}`, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': '5000',
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit positions error: ${data.retMsg}`);
    }

    // Фильтруем только открытые позиции
    const openPositions = data.result.list.filter((pos: any) => parseFloat(pos.size) > 0);
    
    console.log(`🟦 BYBIT V58 RESTORED: Found ${openPositions.length} open positions`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT V58 RESTORED Positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Закрытие всех позиций
async function handleBybitClosePositions(apiKeys: any) {
  console.log('🟦 BYBIT V58 RESTORED: Closing all positions');
  
  try {
    // Сначала получаем список открытых позиций
    const positionsResponse = await handleBybitPositions(apiKeys);
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
    
    // Закрываем каждую позицию
    for (const position of openPositions) {
      try {
        const timestamp = Date.now().toString();
        const closeSide = position.side === 'Buy' ? 'Sell' : 'Buy';
        
        const closeParams = JSON.stringify({
          category: 'linear',
          symbol: position.symbol,
          side: closeSide,
          orderType: 'Market',
          qty: position.size,
          reduceOnly: true
        });
        
        const signature = await createBybitSignature(closeParams, apiKeys.api_secret, timestamp);
        
        const response = await fetch('https://api.bybit.com/v5/order/create', {
          method: 'POST',
          headers: {
            'X-BAPI-API-KEY': apiKeys.api_key,
            'X-BAPI-SIGN': signature,
            'X-BAPI-SIGN-TYPE': '2',
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-RECV-WINDOW': '5000',
            'Content-Type': 'application/json'
          },
          body: closeParams
        });

        const data = await response.json();
        
        if (data.retCode !== 0) {
          closeResults.push({
            symbol: position.symbol,
            success: false,
            error: data.retMsg
          });
          console.log(`❌ Error closing ${position.symbol}: ${data.retMsg}`);
        } else {
          closeResults.push({
            symbol: position.symbol,
            success: true,
            order_id: data.result.orderId
          });
          console.log(`✅ Position ${position.symbol} closed successfully`);
        }
        
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 100));
        
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
    
    console.log(`🟦 BYBIT V58 RESTORED: Closed ${successCount} of ${closeResults.length} positions`);
    
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
    console.error('❌ BYBIT V58 RESTORED Close positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit close positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена ордеров
async function handleBybitCancelOrders(apiKeys: any) {
  console.log('🟦 BYBIT V58 RESTORED: Canceling orders');
  
  try {
    const timestamp = Date.now().toString();
    const cancelParams = JSON.stringify({
      category: 'linear',
      settleCoin: 'USDT'
    });
    
    const signature = await createBybitSignature(cancelParams, apiKeys.api_secret, timestamp);
    
    const response = await fetch('https://api.bybit.com/v5/order/cancel-all', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': '5000',
        'Content-Type': 'application/json'
      },
      body: cancelParams
    });

    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit cancel error: ${data.retMsg}`);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Все ордера отменены',
        data: data.result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ BYBIT V58 RESTORED Cancel orders error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit cancel orders error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}