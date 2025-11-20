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

    console.log(`🟨 BINANCE STEPSIZE: ${action} - ${order_type} direction`);

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
        return await handleBinanceBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handleBinanceOrderWithTPSL(apiKeys, settings, order_type);
      
      case 'get_positions':
        return await handleBinancePositions(apiKeys);
      
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
    console.error('❌ BINANCE STEPSIZE Error:', error.message);
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

// Получение баланса Binance
async function handleBinanceBalance(apiKeys: any) {
  console.log('🟨 BINANCE STEPSIZE: Getting balance');
  
  try {
    // Увеличиваем задержку из-за бана
    await new Promise(resolve => setTimeout(resolve, 5000));
    
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
    
    console.log('🟨 BINANCE STEPSIZE: Balance extracted:', balance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: balance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BINANCE STEPSIZE balance error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Binance balance error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Функция правильного расчета quantity с учетом stepSize
function calculateQuantityWithStepSize(rawQuantity: number, stepSize: string): string {
  const stepSizeFloat = parseFloat(stepSize);
  
  // Определяем количество знаков после запятой в stepSize
  const stepSizeStr = stepSize.toString();
  let decimalPlaces = 0;
  
  if (stepSizeStr.includes('.')) {
    decimalPlaces = stepSizeStr.split('.')[1].length;
  }
  
  // Округляем quantity до ближайшего кратного stepSize
  const adjustedQuantity = Math.floor(rawQuantity / stepSizeFloat) * stepSizeFloat;
  
  // Форматируем с правильным количеством знаков после запятой
  return adjustedQuantity.toFixed(decimalPlaces);
}

// НОВАЯ функция размещения ордера с правильным расчетом quantity
async function handleBinanceOrderWithTPSL(apiKeys: any, settings: any, orderType: string = 'LONG') {
  console.log(`🟨 BINANCE STEPSIZE: Placing ${orderType} order with TP/SL using correct stepSize`);
  
  try {
    // Увеличиваем задержку из-за бана
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Получаем баланс для расчета размера позиции
    const balanceResponse = await handleBinanceBalance(apiKeys);
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
      console.log('🟨 BINANCE STEPSIZE: Position size increased to minimum 10 USDT');
    }
    
    console.log(`🟨 BINANCE STEPSIZE: Balance: ${availableBalance}, Leverage: ${leverage}x, Risk: ${riskPercent * 100}%, Position Size: ${positionSize} USDT`);
    
    // Получаем информацию о символе и текущую цену
    const symbol = settings?.symbol || 'BTCUSDT';
    
    // Получаем информацию о символе для stepSize
    const exchangeInfoResponse = await fetch(`https://fapi.binance.com/fapi/v1/exchangeInfo?symbol=${symbol}`);
    const exchangeInfoData = await exchangeInfoResponse.json();
    
    if (exchangeInfoData.code) {
      throw new Error(`Не удалось получить информацию о символе ${symbol}: ${exchangeInfoData.msg}`);
    }
    
    const symbolInfo = exchangeInfoData.symbols[0];
    const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
    const stepSize = lotSizeFilter?.stepSize || '0.001';
    
    console.log(`🟨 BINANCE STEPSIZE: Symbol: ${symbol}, StepSize: ${stepSize}`);
    
    // Получаем текущую цену
    const tickerResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    const tickerData = await tickerResponse.json();
    
    if (tickerData.code) {
      throw new Error(`Не удалось получить цену для ${symbol}: ${tickerData.msg}`);
    }
    
    const currentPrice = parseFloat(tickerData.price);
    
    // Рассчитываем quantity с учетом stepSize
    const rawQuantity = positionSize / currentPrice;
    const finalQuantity = calculateQuantityWithStepSize(rawQuantity, stepSize);
    
    console.log(`🟨 BINANCE STEPSIZE: Price: ${currentPrice}, Raw Quantity: ${rawQuantity}, Final Quantity: ${finalQuantity}`);
    
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
    
    console.log(`🟨 BINANCE STEPSIZE: TP: ${tpPrice}, SL: ${slPrice}, Quantity: ${finalQuantity}`);
    
    // 1. Размещаем основной ордер с правильным quantity
    const timestamp1 = Date.now();
    const orderParams = `symbol=${symbol}&side=${orderType === 'LONG' ? 'BUY' : 'SELL'}&type=MARKET&quantity=${finalQuantity}&timestamp=${timestamp1}`;
    const signature1 = await createBinanceSignature(orderParams, apiKeys.api_secret);
    
    console.log(`🟨 BINANCE STEPSIZE: Order params: ${orderParams}`);
    
    const orderResponse = await fetch('https://fapi.binance.com/fapi/v1/order', {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${orderParams}&signature=${signature1}`
    });

    const orderData = await orderResponse.json();
    
    console.log('🟨 BINANCE STEPSIZE: Order response:', JSON.stringify(orderData, null, 2));
    
    if (orderData.code) {
      throw new Error(`Binance order error: ${orderData.msg}`);
    }

    console.log('🟨 BINANCE STEPSIZE: Main order placed successfully');
    
    // Небольшая задержка перед размещением TP/SL
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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
      console.log('⚠️ BINANCE STEPSIZE: TP order failed:', tpData.msg);
    } else {
      console.log('🟨 BINANCE STEPSIZE: TP order placed:', tpData.orderId);
    }
    
    // Небольшая задержка перед размещением SL
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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
      console.log('⚠️ BINANCE STEPSIZE: SL order failed:', slData.msg);
    } else {
      console.log('🟨 BINANCE STEPSIZE: SL order placed:', slData.orderId);
    }
    
    console.log('🟨 BINANCE STEPSIZE: All orders completed');
    
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
        stop_loss: slPrice
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BINANCE STEPSIZE Order error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Binance order error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций
async function handleBinancePositions(apiKeys: any) {
  console.log('🟨 BINANCE STEPSIZE: Getting positions');
  
  try {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
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
    
    console.log(`🟨 BINANCE STEPSIZE: Found ${openPositions.length} open positions`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BINANCE STEPSIZE Positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Binance positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Закрытие всех позиций
async function handleBinanceClosePositions(apiKeys: any) {
  console.log('🟨 BINANCE STEPSIZE: Closing all positions');
  
  try {
    // Сначала получаем список открытых позиций
    const positionsResponse = await handleBinancePositions(apiKeys);
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
        await new Promise(resolve => setTimeout(resolve, 3000));
        
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
    
    console.log(`🟨 BINANCE STEPSIZE: Closed ${successCount} of ${closeResults.length} positions`);
    
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
    console.error('❌ BINANCE STEPSIZE Close positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Binance close positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена ордеров
async function handleBinanceCancelOrders(apiKeys: any) {
  console.log('🟨 BINANCE STEPSIZE: Canceling orders');
  
  try {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
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
    console.error('❌ BINANCE STEPSIZE Cancel orders error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Binance cancel orders error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}