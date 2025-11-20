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

    console.log(`🟦 BYBIT FINAL: ${action} - ${order_type} direction`);

    // Получаем API ключи пользователя
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'bybit')
      .single();

    if (keysError || !apiKeys) {
      console.log('❌ BYBIT FINAL: API keys not found');
      return new Response(
        JSON.stringify({ success: false, error: 'Bybit API ключи не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Получаем настройки из специальной таблицы Bybit
    const { data: settings, error: settingsError } = await supabaseClient
      .from('bybit_settings_2025_11_10_20_30')
      .select('*')
      .eq('user_id', user_id)
      .single();

    // Если настроек нет, создаем дефолтные
    let bybitSettings = settings;
    if (settingsError || !settings) {
      console.log('🟦 BYBIT FINAL: Creating default settings');
      await supabaseClient.rpc('upsert_bybit_settings', {
        p_user_id: user_id,
        p_symbol: 'BTCUSDT',
        p_leverage: 10,
        p_risk_percent: 2.00,
        p_long_tp: 2.00,
        p_long_sl: 1.00,
        p_short_tp: 2.00,
        p_short_sl: 1.00,
        p_min_order_size: 1.00,
        p_max_positions: 3,
        p_enabled: true
      });
      
      // Получаем созданные настройки
      const { data: createdSettings } = await supabaseClient
        .from('bybit_settings_2025_11_10_20_30')
        .select('*')
        .eq('user_id', user_id)
        .single();
      
      bybitSettings = createdSettings;
    }

    switch (action) {
      case 'get_balance':
        return await handleBybitBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handleBybitOrderWithTPSL(apiKeys, bybitSettings, order_type);
      
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
    console.error('❌ BYBIT FINAL Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Функция создания подписи для Bybit V5 API
async function createBybitSignature(timestamp: string, apiKey: string, recvWindow: string, queryString: string, secret: string): Promise<string> {
  const param_str = timestamp + apiKey + recvWindow + queryString;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(param_str);
  
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
  console.log('🟦 BYBIT FINAL: Getting balance');
  
  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const queryString = 'accountType=UNIFIED';
    
    const signature = await createBybitSignature(timestamp, apiKeys.api_key, recvWindow, queryString, apiKeys.api_secret);
    
    const response = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${queryString}`, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'X-BAPI-SIGN': signature,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }

    // Ищем USDT баланс
    let usdtBalance = 0;
    if (data.result?.list?.[0]?.coin) {
      const usdtCoin = data.result.list[0].coin.find((coin: any) => coin.coin === 'USDT');
      if (usdtCoin) {
        usdtBalance = parseFloat(usdtCoin.walletBalance || '0');
      }
    }
    
    console.log('🟦 BYBIT FINAL: Balance extracted:', usdtBalance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: usdtBalance,
        raw_data: data.result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT FINAL balance error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit balance error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Размещение ордера
async function handleBybitOrderWithTPSL(apiKeys: any, settings: any, orderType: string = 'LONG') {
  console.log(`🟦 BYBIT FINAL: Placing ${orderType} order`);
  
  try {
    // Получаем баланс
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
    
    // Минимум 5 USDT для Bybit
    if (positionSize < 5) {
      positionSize = 5;
    }
    
    console.log(`🟦 BYBIT FINAL: Position Size: ${positionSize} USDT`);
    
    // Получаем текущую цену
    const symbol = settings?.symbol || 'BTCUSDT';
    const tickerResponse = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
    const tickerData = await tickerResponse.json();
    
    if (tickerData.retCode !== 0 || !tickerData.result?.list?.[0]) {
      throw new Error(`Не удалось получить цену для ${symbol}`);
    }
    
    const currentPrice = parseFloat(tickerData.result.list[0].lastPrice);
    
    // Получаем информацию об инструменте
    const instrumentResponse = await fetch(`https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=${symbol}`);
    const instrumentData = await instrumentResponse.json();
    
    let minOrderQty = 0.001;
    let qtyStep = 0.001;
    
    if (instrumentData.retCode === 0 && instrumentData.result?.list?.[0]) {
      const instrument = instrumentData.result.list[0];
      minOrderQty = parseFloat(instrument.lotSizeFilter?.minOrderQty || '0.001');
      qtyStep = parseFloat(instrument.lotSizeFilter?.qtyStep || '0.001');
    }
    
    // Рассчитываем quantity
    const rawQuantity = positionSize / currentPrice;
    let finalQuantity = Math.max(rawQuantity, minOrderQty);
    
    // Округляем до правильного шага
    finalQuantity = Math.floor(finalQuantity / qtyStep) * qtyStep;
    finalQuantity = parseFloat(finalQuantity.toFixed(6));
    
    if (finalQuantity < minOrderQty) {
      finalQuantity = minOrderQty;
    }
    
    // Рассчитываем TP/SL
    let takeProfit, stopLoss;
    if (orderType === 'LONG') {
      takeProfit = parseFloat(settings?.long_tp || '2') / 100;
      stopLoss = parseFloat(settings?.long_sl || '1') / 100;
    } else {
      takeProfit = parseFloat(settings?.short_tp || '2') / 100;
      stopLoss = parseFloat(settings?.short_sl || '1') / 100;
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
    
    console.log(`🟦 BYBIT FINAL: TP: ${tpPrice}, SL: ${slPrice}, Qty: ${finalQuantity}`);
    
    // Размещаем ордер
    const timestamp1 = Date.now().toString();
    const recvWindow1 = '5000';
    const orderBody = {
      category: 'linear',
      symbol: symbol,
      side: orderType === 'LONG' ? 'Buy' : 'Sell',
      orderType: 'Market',
      qty: finalQuantity.toString(),
      takeProfit: tpPrice,
      stopLoss: slPrice
    };
    
    const bodyString = JSON.stringify(orderBody);
    const signature1 = await createBybitSignature(timestamp1, apiKeys.api_key, recvWindow1, bodyString, apiKeys.api_secret);
    
    const orderResponse = await fetch('https://api.bybit.com/v5/order/create', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-TIMESTAMP': timestamp1,
        'X-BAPI-RECV-WINDOW': recvWindow1,
        'X-BAPI-SIGN': signature1,
        'Content-Type': 'application/json'
      },
      body: bodyString
    });

    const orderData = await orderResponse.json();
    
    if (orderData.retCode !== 0) {
      throw new Error(`Bybit order error: ${orderData.retMsg}`);
    }

    console.log('✅ BYBIT FINAL: Order placed successfully!');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: orderData.result?.orderId,
        symbol: symbol,
        side: orderType,
        quantity: finalQuantity,
        price: currentPrice,
        take_profit: tpPrice,
        stop_loss: slPrice,
        method: 'final_version'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT FINAL Order error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit order error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ИСПРАВЛЕННАЯ функция получения позиций
async function handleBybitPositions(apiKeys: any) {
  console.log('🟦 BYBIT FINAL: Getting positions - FIXED VERSION');
  
  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const queryString = 'category=linear&settleCoin=USDT';  // Добавляем settleCoin
    
    const signature = await createBybitSignature(timestamp, apiKeys.api_key, recvWindow, queryString, apiKeys.api_secret);
    
    console.log('🟦 BYBIT FINAL: Positions request URL:', `https://api.bybit.com/v5/position/list?${queryString}`);
    
    const response = await fetch(`https://api.bybit.com/v5/position/list?${queryString}`, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'X-BAPI-SIGN': signature,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    console.log('🟦 BYBIT FINAL: Positions response status:', response.status);
    console.log('🟦 BYBIT FINAL: Positions response retCode:', data.retCode);
    console.log('🟦 BYBIT FINAL: Positions response retMsg:', data.retMsg);
    
    if (data.retCode !== 0) {
      console.log('❌ BYBIT FINAL: Positions API error:', data.retMsg);
      throw new Error(`Bybit positions error: ${data.retMsg}`);
    }

    // Фильтруем только открытые позиции
    const allPositions = data.result?.list || [];
    const openPositions = allPositions.filter((pos: any) => {
      const size = parseFloat(pos.size || '0');
      return size !== 0;
    });
    
    console.log(`🟦 BYBIT FINAL: Total positions: ${allPositions.length}, Open positions: ${openPositions.length}`);
    
    if (openPositions.length > 0) {
      console.log('🟦 BYBIT FINAL: Open positions details:', JSON.stringify(openPositions, null, 2));
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length,
        all_positions_count: allPositions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT FINAL Positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ИСПРАВЛЕННАЯ функция закрытия позиций
async function handleBybitClosePositions(apiKeys: any) {
  console.log('🟦 BYBIT FINAL: Closing all positions - FIXED VERSION');
  
  try {
    // Сначала получаем список открытых позиций
    const positionsResponse = await handleBybitPositions(apiKeys);
    const positionsData = await positionsResponse.json();
    
    console.log('🟦 BYBIT FINAL: Close positions - positions data:', JSON.stringify(positionsData, null, 2));
    
    if (!positionsData.success) {
      console.log('❌ BYBIT FINAL: Failed to get positions for closing');
      throw new Error(`Не удалось получить список позиций: ${positionsData.error}`);
    }
    
    const openPositions = positionsData.positions;
    
    if (openPositions.length === 0) {
      console.log('🟦 BYBIT FINAL: No open positions to close');
      return new Response(
        JSON.stringify({ success: true, message: 'Нет открытых позиций для закрытия' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`🟦 BYBIT FINAL: Found ${openPositions.length} positions to close`);
    
    const closeResults = [];
    
    // Закрываем каждую позицию
    for (const position of openPositions) {
      try {
        console.log('🟦 BYBIT FINAL: Closing position:', position.symbol, 'Size:', position.size, 'Side:', position.side);
        
        const timestamp = Date.now().toString();
        const recvWindow = '5000';
        const positionSize = Math.abs(parseFloat(position.size));
        const closeSide = position.side === 'Buy' ? 'Sell' : 'Buy';
        
        const closeBody = {
          category: 'linear',
          symbol: position.symbol,
          side: closeSide,
          orderType: 'Market',
          qty: positionSize.toString(),
          reduceOnly: true  // Добавляем reduceOnly для закрытия позиции
        };
        
        const bodyString = JSON.stringify(closeBody);
        const signature = await createBybitSignature(timestamp, apiKeys.api_key, recvWindow, bodyString, apiKeys.api_secret);
        
        console.log('🟦 BYBIT FINAL: Close order body:', bodyString);
        
        const response = await fetch('https://api.bybit.com/v5/order/create', {
          method: 'POST',
          headers: {
            'X-BAPI-API-KEY': apiKeys.api_key,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-RECV-WINDOW': recvWindow,
            'X-BAPI-SIGN': signature,
            'Content-Type': 'application/json'
          },
          body: bodyString
        });

        const data = await response.json();
        
        console.log('🟦 BYBIT FINAL: Close response:', JSON.stringify(data, null, 2));
        
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
            order_id: data.result?.orderId
          });
          console.log(`✅ Position ${position.symbol} closed successfully`);
        }
        
        // Задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 300));
        
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
    
    console.log(`🟦 BYBIT FINAL: Closed ${successCount} of ${closeResults.length} positions`);
    
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
    console.error('❌ BYBIT FINAL Close positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit close positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ИСПРАВЛЕННАЯ функция отмены ордеров
async function handleBybitCancelOrders(apiKeys: any) {
  console.log('🟦 BYBIT FINAL: Canceling orders - FIXED VERSION');
  
  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const cancelBody = {
      category: 'linear',
      settleCoin: 'USDT'  // Добавляем settleCoin
    };
    
    const bodyString = JSON.stringify(cancelBody);
    const signature = await createBybitSignature(timestamp, apiKeys.api_key, recvWindow, bodyString, apiKeys.api_secret);
    
    console.log('🟦 BYBIT FINAL: Cancel body:', bodyString);
    
    const response = await fetch('https://api.bybit.com/v5/order/cancel-all', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'X-BAPI-SIGN': signature,
        'Content-Type': 'application/json'
      },
      body: bodyString
    });

    const data = await response.json();
    
    console.log('🟦 BYBIT FINAL: Cancel response:', JSON.stringify(data, null, 2));
    
    if (data.retCode !== 0) {
      console.log('❌ BYBIT FINAL: Cancel failed:', data.retMsg);
      throw new Error(`Bybit cancel error: ${data.retMsg}`);
    }
    
    console.log('✅ BYBIT FINAL: Orders cancelled successfully');
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Все ордера отменены',
        data: data.result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ BYBIT FINAL Cancel orders error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit cancel orders error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}