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

    console.log(`🟠 MEXC V32 RESTORED: ${action} - ${order_type} direction`);

    // Получаем API ключи пользователя
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'mexc')
      .single();

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ success: false, error: 'MEXC API ключи не найдены' }),
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
        return await handleMEXCBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handleMEXCOrderWithTPSL(apiKeys, settings, order_type);
      
      case 'get_positions':
        return await handleMEXCPositions(apiKeys);
      
      case 'close_positions':
      case 'close_all_positions':
        return await handleMEXCClosePositions(apiKeys);
      
      case 'cancel_orders':
      case 'cancel_all_orders':
        return await handleMEXCCancelOrders(apiKeys);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ MEXC V32 RESTORED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Функция создания подписи для MEXC API (исправленная версия v32)
async function createMEXCSignature(queryString: string, secret: string): Promise<string> {
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

// Получение баланса MEXC
async function handleMEXCBalance(apiKeys: any) {
  console.log('🟠 MEXC V32 RESTORED: Getting balance');
  
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createMEXCSignature(queryString, apiKeys.api_secret);
    
    const response = await fetch(`https://contract.mexc.com/api/v1/private/account/assets?${queryString}&signature=${signature}`, {
      method: 'GET',
      headers: {
        'ApiKey': apiKeys.api_key,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`MEXC API error: ${data.errorMsg || 'Unknown error'}`);
    }

    const usdtAsset = data.data?.find((asset: any) => asset.currency === 'USDT');
    const balance = parseFloat(usdtAsset?.availableBalance || '0');
    
    console.log('🟠 MEXC V32 RESTORED: Balance extracted:', balance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: balance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ MEXC V32 RESTORED balance error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `MEXC balance error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Размещение ордера с TP/SL (версия v32)
async function handleMEXCOrderWithTPSL(apiKeys: any, settings: any, orderType: string = 'LONG') {
  console.log(`🟠 MEXC V32 RESTORED: Placing ${orderType} order with TP/SL`);
  
  try {
    // Получаем баланс для расчета размера позиции
    const balanceResponse = await handleMEXCBalance(apiKeys);
    const balanceData = await balanceResponse.json();
    
    if (!balanceData.success) {
      throw new Error('Не удалось получить баланс');
    }
    
    const availableBalance = balanceData.balance;
    const leverage = parseInt(settings?.leverage || '10');
    const riskPercent = parseFloat(settings?.risk_percent || '2') / 100;
    
    // Рассчитываем размер позиции в USDT
    let positionSize = availableBalance * riskPercent * leverage;
    
    // Минимум 1 USDT для MEXC
    if (positionSize < 1) {
      positionSize = 1;
      console.log('🟠 MEXC V32 RESTORED: Position size increased to minimum 1 USDT');
    }
    
    console.log(`🟠 MEXC V32 RESTORED: Balance: ${availableBalance}, Leverage: ${leverage}x, Risk: ${riskPercent * 100}%, Position Size: ${positionSize} USDT`);
    
    // Получаем текущую цену для настроенного символа
    const symbol = settings?.symbol || 'BTC_USDT';
    const tickerResponse = await fetch(`https://contract.mexc.com/api/v1/contract/ticker?symbol=${symbol}`);
    const tickerData = await tickerResponse.json();
    
    if (!tickerData.success) {
      throw new Error(`Не удалось получить цену для ${symbol}: ${tickerData.errorMsg}`);
    }
    
    const currentPrice = parseFloat(tickerData.data.lastPrice);
    
    // Рассчитываем quantity
    const rawQuantity = positionSize / currentPrice;
    const finalQuantity = Math.floor(rawQuantity);
    
    console.log(`🟠 MEXC V32 RESTORED: Price: ${currentPrice}, Raw Quantity: ${rawQuantity}, Final Quantity: ${finalQuantity}`);
    
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
    
    console.log(`🟠 MEXC V32 RESTORED: TP: ${tpPrice}, SL: ${slPrice}, Quantity: ${finalQuantity}`);
    
    // 1. Размещаем основной ордер
    const timestamp1 = Date.now();
    const orderParams = `symbol=${symbol}&side=${orderType === 'LONG' ? '1' : '2'}&type=5&vol=${finalQuantity}&leverage=${leverage}&timestamp=${timestamp1}`;
    const signature1 = await createMEXCSignature(orderParams, apiKeys.api_secret);
    
    console.log(`🟠 MEXC V32 RESTORED: Order params: ${orderParams}`);
    
    const orderResponse = await fetch('https://contract.mexc.com/api/v1/private/order/submit', {
      method: 'POST',
      headers: {
        'ApiKey': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${orderParams}&signature=${signature1}`
    });

    const orderData = await orderResponse.json();
    
    console.log('🟠 MEXC V32 RESTORED: Order response:', JSON.stringify(orderData, null, 2));
    
    if (!orderData.success) {
      throw new Error(`MEXC order error: ${orderData.errorMsg || 'Unknown error'}`);
    }

    console.log('🟠 MEXC V32 RESTORED: Main order placed successfully');
    
    // Небольшая задержка перед размещением TP/SL
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 2. Размещаем Take Profit ордер
    const timestamp2 = Date.now();
    const tpParams = `symbol=${symbol}&side=${orderType === 'LONG' ? '2' : '1'}&type=3&vol=${finalQuantity}&price=${tpPrice}&timestamp=${timestamp2}`;
    const signature2 = await createMEXCSignature(tpParams, apiKeys.api_secret);
    
    const tpResponse = await fetch('https://contract.mexc.com/api/v1/private/order/submit', {
      method: 'POST',
      headers: {
        'ApiKey': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${tpParams}&signature=${signature2}`
    });

    const tpData = await tpResponse.json();
    
    if (!tpData.success) {
      console.log('⚠️ MEXC V32 RESTORED: TP order failed:', tpData.errorMsg);
    } else {
      console.log('🟠 MEXC V32 RESTORED: TP order placed:', tpData.data);
    }
    
    // Небольшая задержка перед размещением SL
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 3. Размещаем Stop Loss ордер
    const timestamp3 = Date.now();
    const slParams = `symbol=${symbol}&side=${orderType === 'LONG' ? '2' : '1'}&type=4&vol=${finalQuantity}&price=${slPrice}&timestamp=${timestamp3}`;
    const signature3 = await createMEXCSignature(slParams, apiKeys.api_secret);
    
    const slResponse = await fetch('https://contract.mexc.com/api/v1/private/order/submit', {
      method: 'POST',
      headers: {
        'ApiKey': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${slParams}&signature=${signature3}`
    });

    const slData = await slResponse.json();
    
    if (!slData.success) {
      console.log('⚠️ MEXC V32 RESTORED: SL order failed:', slData.errorMsg);
    } else {
      console.log('🟠 MEXC V32 RESTORED: SL order placed:', slData.data);
    }
    
    console.log('🟠 MEXC V32 RESTORED: All orders completed');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        main_order_id: orderData.data,
        tp_order_id: tpData.data || null,
        sl_order_id: slData.data || null,
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
    console.error('❌ MEXC V32 RESTORED Order error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `MEXC order error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций
async function handleMEXCPositions(apiKeys: any) {
  console.log('🟠 MEXC V32 RESTORED: Getting positions');
  
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createMEXCSignature(queryString, apiKeys.api_secret);
    
    const response = await fetch(`https://contract.mexc.com/api/v1/private/position/list/all?${queryString}&signature=${signature}`, {
      method: 'GET',
      headers: {
        'ApiKey': apiKeys.api_key,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`MEXC positions error: ${data.errorMsg || 'Unknown error'}`);
    }

    // Фильтруем только открытые позиции
    const openPositions = data.data.filter((pos: any) => parseFloat(pos.positionSize) !== 0);
    
    console.log(`🟠 MEXC V32 RESTORED: Found ${openPositions.length} open positions`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ MEXC V32 RESTORED Positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `MEXC positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Закрытие всех позиций
async function handleMEXCClosePositions(apiKeys: any) {
  console.log('🟠 MEXC V32 RESTORED: Closing all positions');
  
  try {
    // Сначала получаем список открытых позиций
    const positionsResponse = await handleMEXCPositions(apiKeys);
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
        const timestamp = Date.now();
        const positionSize = Math.abs(parseFloat(position.positionSize));
        const closeSide = parseFloat(position.positionSize) > 0 ? '2' : '1'; // Противоположное направление
        
        const closeParams = `symbol=${position.symbol}&side=${closeSide}&type=5&vol=${positionSize}&timestamp=${timestamp}`;
        const signature = await createMEXCSignature(closeParams, apiKeys.api_secret);
        
        const response = await fetch('https://contract.mexc.com/api/v1/private/order/submit', {
          method: 'POST',
          headers: {
            'ApiKey': apiKeys.api_key,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `${closeParams}&signature=${signature}`
        });

        const data = await response.json();
        
        if (!data.success) {
          closeResults.push({
            symbol: position.symbol,
            success: false,
            error: data.errorMsg || 'Unknown error'
          });
          console.log(`❌ Error closing ${position.symbol}: ${data.errorMsg}`);
        } else {
          closeResults.push({
            symbol: position.symbol,
            success: true,
            order_id: data.data
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
    
    console.log(`🟠 MEXC V32 RESTORED: Closed ${successCount} of ${closeResults.length} positions`);
    
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
    console.error('❌ MEXC V32 RESTORED Close positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `MEXC close positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена ордеров
async function handleMEXCCancelOrders(apiKeys: any) {
  console.log('🟠 MEXC V32 RESTORED: Canceling orders');
  
  try {
    const timestamp = Date.now();
    const cancelParams = `timestamp=${timestamp}`;
    const signature = await createMEXCSignature(cancelParams, apiKeys.api_secret);
    
    const response = await fetch('https://contract.mexc.com/api/v1/private/order/cancel/all', {
      method: 'POST',
      headers: {
        'ApiKey': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${cancelParams}&signature=${signature}`
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`MEXC cancel error: ${data.errorMsg || 'Unknown error'}`);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Все ордера отменены',
        data: data.data
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ MEXC V32 RESTORED Cancel orders error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `MEXC cancel orders error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}