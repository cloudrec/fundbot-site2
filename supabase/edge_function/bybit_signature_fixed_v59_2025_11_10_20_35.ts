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

    console.log(`🟦 BYBIT FIXED SIGN: ${action} - ${order_type} direction`);

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

    // Получаем настройки из специальной таблицы Bybit
    const { data: settings, error: settingsError } = await supabaseClient
      .from('bybit_settings_2025_11_10_20_30')
      .select('*')
      .eq('user_id', user_id)
      .single();

    // Если настроек нет, создаем дефолтные
    let bybitSettings = settings;
    if (settingsError || !settings) {
      console.log('🟦 BYBIT FIXED SIGN: Creating default settings');
      const { data: newSettings } = await supabaseClient.rpc('upsert_bybit_settings', {
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
    console.error('❌ BYBIT FIXED SIGN Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ИСПРАВЛЕННАЯ функция создания подписи для Bybit API
async function createBybitSignature(timestamp: string, apiKey: string, recvWindow: string, queryString: string, secret: string): Promise<string> {
  // Правильный формат для Bybit V5 API
  const param_str = timestamp + apiKey + recvWindow + queryString;
  
  console.log('🟦 BYBIT FIXED SIGN: Creating signature for:', param_str);
  
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
  
  console.log('🟦 BYBIT FIXED SIGN: Generated signature:', hexSignature);
  
  return hexSignature;
}

// Получение баланса Bybit с исправленной подписью
async function handleBybitBalance(apiKeys: any) {
  console.log('🟦 BYBIT FIXED SIGN: Getting balance');
  
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
    
    console.log('🟦 BYBIT FIXED SIGN: Balance response:', JSON.stringify(data, null, 2));
    
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
    
    console.log('🟦 BYBIT FIXED SIGN: Balance extracted:', usdtBalance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: usdtBalance,
        raw_data: data.result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT FIXED SIGN balance error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit balance error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение минимального размера ордера для символа
async function getBybitMinOrderSize(symbol: string): Promise<number> {
  try {
    console.log(`🟦 BYBIT FIXED SIGN: Getting min order size for ${symbol}`);
    
    const response = await fetch(`https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=${symbol}`);
    const data = await response.json();
    
    if (data.retCode !== 0 || !data.result?.list?.[0]) {
      console.log('⚠️ BYBIT FIXED SIGN: Instrument info failed, using default min size');
      return 0.001; // Дефолтный минимальный размер
    }
    
    const instrument = data.result.list[0];
    const minOrderQty = parseFloat(instrument.lotSizeFilter?.minOrderQty || '0.001');
    
    console.log(`🟦 BYBIT FIXED SIGN: Found min order size for ${symbol}: ${minOrderQty}`);
    
    return minOrderQty;
    
  } catch (error) {
    console.log('⚠️ BYBIT FIXED SIGN: Error getting min order size, using default:', error.message);
    return 0.001; // Дефолтный минимальный размер при ошибке
  }
}

// Размещение ордера с исправленной подписью
async function handleBybitOrderWithTPSL(apiKeys: any, settings: any, orderType: string = 'LONG') {
  console.log(`🟦 BYBIT FIXED SIGN: Placing ${orderType} order with FIXED SIGNATURE`);
  
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
    
    // Минимум 1 USDT для Bybit
    if (positionSize < 1) {
      positionSize = 1;
      console.log('🟦 BYBIT FIXED SIGN: Position size increased to minimum 1 USDT');
    }
    
    console.log(`🟦 BYBIT FIXED SIGN: Balance: ${availableBalance}, Leverage: ${leverage}x, Risk: ${riskPercent * 100}%, Position Size: ${positionSize} USDT`);
    
    // Получаем текущую цену
    const symbol = settings?.symbol || 'BTCUSDT';
    const tickerResponse = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
    const tickerData = await tickerResponse.json();
    
    if (tickerData.retCode !== 0 || !tickerData.result?.list?.[0]) {
      throw new Error(`Не удалось получить цену для ${symbol}: ${tickerData.retMsg}`);
    }
    
    const currentPrice = parseFloat(tickerData.result.list[0].lastPrice);
    
    // ИСПРАВЛЕНИЕ MINIMUM LIMIT: Получаем минимальный размер ордера
    const minOrderSize = await getBybitMinOrderSize(symbol);
    
    // Рассчитываем quantity с учетом минимального размера
    const rawQuantity = positionSize / currentPrice;
    let finalQuantity = rawQuantity;
    
    // Убеждаемся что quantity больше минимального
    if (finalQuantity < minOrderSize) {
      finalQuantity = minOrderSize;
      console.log(`🟦 BYBIT FIXED SIGN: Quantity increased to minimum: ${minOrderSize}`);
    }
    
    // Округляем до разумного количества знаков
    finalQuantity = parseFloat(finalQuantity.toFixed(6));
    
    console.log(`🟦 BYBIT FIXED SIGN: Price: ${currentPrice}, Raw Quantity: ${rawQuantity}, Min Order Size: ${minOrderSize}, Final Quantity: ${finalQuantity}`);
    
    // Выбираем правильные TP/SL в зависимости от типа ордера
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
    
    console.log(`🟦 BYBIT FIXED SIGN: TP: ${tpPrice}, SL: ${slPrice}, Quantity: ${finalQuantity}`);
    
    // 1. Размещаем основной ордер с исправленной подписью
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
    
    console.log(`🟦 BYBIT FIXED SIGN: Order body: ${bodyString}`);
    
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
    
    console.log('🟦 BYBIT FIXED SIGN: Order response:', JSON.stringify(orderData, null, 2));
    
    if (orderData.retCode !== 0) {
      throw new Error(`Bybit order error: ${orderData.retMsg}`);
    }

    console.log('🟦 BYBIT FIXED SIGN: Order placed successfully with TP/SL and FIXED SIGNATURE');
    
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
        min_order_size: minOrderSize,
        method: 'fixed_signature'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT FIXED SIGN Order error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit order error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций с исправленной подписью
async function handleBybitPositions(apiKeys: any) {
  console.log('🟦 BYBIT FIXED SIGN: Getting positions');
  
  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const queryString = 'category=linear';
    
    const signature = await createBybitSignature(timestamp, apiKeys.api_key, recvWindow, queryString, apiKeys.api_secret);
    
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
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit positions error: ${data.retMsg}`);
    }

    // Фильтруем только открытые позиции
    const openPositions = data.result?.list?.filter((pos: any) => parseFloat(pos.size) !== 0) || [];
    
    console.log(`🟦 BYBIT FIXED SIGN: Found ${openPositions.length} open positions`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT FIXED SIGN Positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Закрытие всех позиций с исправленной подписью
async function handleBybitClosePositions(apiKeys: any) {
  console.log('🟦 BYBIT FIXED SIGN: Closing all positions');
  
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
        const recvWindow = '5000';
        const positionSize = parseFloat(position.size);
        const closeSide = position.side === 'Buy' ? 'Sell' : 'Buy';
        
        const closeBody = {
          category: 'linear',
          symbol: position.symbol,
          side: closeSide,
          orderType: 'Market',
          qty: positionSize.toString()
        };
        
        const bodyString = JSON.stringify(closeBody);
        const signature = await createBybitSignature(timestamp, apiKeys.api_key, recvWindow, bodyString, apiKeys.api_secret);
        
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
    
    console.log(`🟦 BYBIT FIXED SIGN: Closed ${successCount} of ${closeResults.length} positions`);
    
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
    console.error('❌ BYBIT FIXED SIGN Close positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit close positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена ордеров с исправленной подписью
async function handleBybitCancelOrders(apiKeys: any) {
  console.log('🟦 BYBIT FIXED SIGN: Canceling orders');
  
  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const cancelBody = {
      category: 'linear'
    };
    
    const bodyString = JSON.stringify(cancelBody);
    const signature = await createBybitSignature(timestamp, apiKeys.api_key, recvWindow, bodyString, apiKeys.api_secret);
    
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
    console.error('❌ BYBIT FIXED SIGN Cancel orders error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit cancel orders error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}