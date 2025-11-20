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

    console.log(`🔵 GATE V24 RESTORED: ${action} - ${order_type} direction`);

    // Получаем API ключи пользователя
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate')
      .single();

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ success: false, error: 'Gate.io API ключи не найдены' }),
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
        return await handleGateBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handleGateOrderWithTPSL(apiKeys, settings, order_type);
      
      case 'get_positions':
        return await handleGatePositions(apiKeys);
      
      case 'close_positions':
      case 'close_all_positions':
        return await handleGateClosePositions(apiKeys);
      
      case 'cancel_orders':
      case 'cancel_all_orders':
        return await handleGateCancelOrders(apiKeys);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ GATE V24 RESTORED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Функция создания подписи для Gate.io API
async function createGateSignature(method: string, url: string, queryString: string, body: string, secret: string, timestamp: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  
  // Создаем строку для подписи
  const bodyHash = await crypto.subtle.digest('SHA-512', encoder.encode(body));
  const bodyHashHex = Array.from(new Uint8Array(bodyHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const signString = `${method}\n${url}\n${queryString}\n${bodyHashHex}\n${timestamp}`;
  const messageData = encoder.encode(signString);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hexSignature = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return hexSignature;
}

// Получение баланса Gate.io
async function handleGateBalance(apiKeys: any) {
  console.log('🔵 GATE V24 RESTORED: Getting balance');
  
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/accounts';
    const queryString = '';
    const body = '';
    
    const signature = await createGateSignature(method, url, queryString, body, apiKeys.api_secret, timestamp);
    
    const response = await fetch(`https://api.gateio.ws${url}`, {
      method: method,
      headers: {
        'KEY': apiKeys.api_key,
        'SIGN': signature,
        'Timestamp': timestamp,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Gate.io API error: ${data.message || 'Unknown error'}`);
    }

    const balance = parseFloat(data.available || '0');
    
    console.log('🔵 GATE V24 RESTORED: Balance extracted:', balance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: balance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ GATE V24 RESTORED balance error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Gate.io balance error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Размещение ордера с TP/SL (версия v24)
async function handleGateOrderWithTPSL(apiKeys: any, settings: any, orderType: string = 'LONG') {
  console.log(`🔵 GATE V24 RESTORED: Placing ${orderType} order with TP/SL`);
  
  try {
    // Получаем баланс для расчета размера позиции
    const balanceResponse = await handleGateBalance(apiKeys);
    const balanceData = await balanceResponse.json();
    
    if (!balanceData.success) {
      throw new Error('Не удалось получить баланс');
    }
    
    const availableBalance = balanceData.balance;
    const leverage = parseInt(settings?.leverage || '10');
    const riskPercent = parseFloat(settings?.risk_percent || '2') / 100;
    
    // Рассчитываем размер позиции в USDT
    let positionSize = availableBalance * riskPercent * leverage;
    
    // Минимум 1 USDT для Gate.io
    if (positionSize < 1) {
      positionSize = 1;
      console.log('🔵 GATE V24 RESTORED: Position size increased to minimum 1 USDT');
    }
    
    console.log(`🔵 GATE V24 RESTORED: Balance: ${availableBalance}, Leverage: ${leverage}x, Risk: ${riskPercent * 100}%, Position Size: ${positionSize} USDT`);
    
    // Получаем текущую цену для настроенного символа
    const symbol = settings?.symbol || 'BTC_USDT';
    const tickerResponse = await fetch(`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${symbol}`);
    const tickerData = await tickerResponse.json();
    
    if (!Array.isArray(tickerData) || tickerData.length === 0) {
      throw new Error(`Не удалось получить цену для ${symbol}`);
    }
    
    const currentPrice = parseFloat(tickerData[0].last);
    
    // Рассчитываем quantity (с увеличенным размером для Gate.io)
    const rawQuantity = (positionSize * 1.15) / currentPrice; // +15% запас для Gate.io
    const finalQuantity = Math.floor(rawQuantity);
    
    console.log(`🔵 GATE V24 RESTORED: Price: ${currentPrice}, Raw Quantity: ${rawQuantity}, Final Quantity: ${finalQuantity}`);
    
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
    
    console.log(`🔵 GATE V24 RESTORED: TP: ${tpPrice}, SL: ${slPrice}, Quantity: ${finalQuantity}`);
    
    // 1. Размещаем основной ордер
    const timestamp1 = Math.floor(Date.now() / 1000).toString();
    const method1 = 'POST';
    const url1 = '/api/v4/futures/usdt/orders';
    const body1 = JSON.stringify({
      contract: symbol,
      size: finalQuantity,
      price: '0', // Market order
      tif: 'ioc'
    });
    
    const signature1 = await createGateSignature(method1, url1, '', body1, apiKeys.api_secret, timestamp1);
    
    console.log(`🔵 GATE V24 RESTORED: Order body: ${body1}`);
    
    const orderResponse = await fetch(`https://api.gateio.ws${url1}`, {
      method: method1,
      headers: {
        'KEY': apiKeys.api_key,
        'SIGN': signature1,
        'Timestamp': timestamp1,
        'Content-Type': 'application/json'
      },
      body: body1
    });

    const orderData = await orderResponse.json();
    
    console.log('🔵 GATE V24 RESTORED: Order response:', JSON.stringify(orderData, null, 2));
    
    if (!orderResponse.ok) {
      throw new Error(`Gate.io order error: ${orderData.message || 'Unknown error'}`);
    }

    console.log('🔵 GATE V24 RESTORED: Main order placed successfully');
    
    // Небольшая задержка перед размещением TP/SL
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 2. Размещаем Take Profit ордер
    const timestamp2 = Math.floor(Date.now() / 1000).toString();
    const tpBody = JSON.stringify({
      contract: symbol,
      size: -finalQuantity, // Противоположное направление
      price: tpPrice,
      tif: 'gtc',
      reduce_only: true
    });
    
    const signature2 = await createGateSignature(method1, url1, '', tpBody, apiKeys.api_secret, timestamp2);
    
    const tpResponse = await fetch(`https://api.gateio.ws${url1}`, {
      method: method1,
      headers: {
        'KEY': apiKeys.api_key,
        'SIGN': signature2,
        'Timestamp': timestamp2,
        'Content-Type': 'application/json'
      },
      body: tpBody
    });

    const tpData = await tpResponse.json();
    
    if (!tpResponse.ok) {
      console.log('⚠️ GATE V24 RESTORED: TP order failed:', tpData.message);
    } else {
      console.log('🔵 GATE V24 RESTORED: TP order placed:', tpData.id);
    }
    
    // Небольшая задержка перед размещением SL
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 3. Размещаем Stop Loss ордер
    const timestamp3 = Math.floor(Date.now() / 1000).toString();
    const slBody = JSON.stringify({
      contract: symbol,
      size: -finalQuantity, // Противоположное направление
      price: slPrice,
      tif: 'gtc',
      reduce_only: true
    });
    
    const signature3 = await createGateSignature(method1, url1, '', slBody, apiKeys.api_secret, timestamp3);
    
    const slResponse = await fetch(`https://api.gateio.ws${url1}`, {
      method: method1,
      headers: {
        'KEY': apiKeys.api_key,
        'SIGN': signature3,
        'Timestamp': timestamp3,
        'Content-Type': 'application/json'
      },
      body: slBody
    });

    const slData = await slResponse.json();
    
    if (!slResponse.ok) {
      console.log('⚠️ GATE V24 RESTORED: SL order failed:', slData.message);
    } else {
      console.log('🔵 GATE V24 RESTORED: SL order placed:', slData.id);
    }
    
    console.log('🔵 GATE V24 RESTORED: All orders completed');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        main_order_id: orderData.id,
        tp_order_id: tpData.id || null,
        sl_order_id: slData.id || null,
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
    console.error('❌ GATE V24 RESTORED Order error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Gate.io order error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций
async function handleGatePositions(apiKeys: any) {
  console.log('🔵 GATE V24 RESTORED: Getting positions');
  
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const url = '/api/v4/futures/usdt/positions';
    const queryString = '';
    const body = '';
    
    const signature = await createGateSignature(method, url, queryString, body, apiKeys.api_secret, timestamp);
    
    const response = await fetch(`https://api.gateio.ws${url}`, {
      method: method,
      headers: {
        'KEY': apiKeys.api_key,
        'SIGN': signature,
        'Timestamp': timestamp,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Gate.io positions error: ${data.message || 'Unknown error'}`);
    }

    // Фильтруем только открытые позиции
    const openPositions = data.filter((pos: any) => parseFloat(pos.size) !== 0);
    
    console.log(`🔵 GATE V24 RESTORED: Found ${openPositions.length} open positions`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ GATE V24 RESTORED Positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Gate.io positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Закрытие всех позиций
async function handleGateClosePositions(apiKeys: any) {
  console.log('🔵 GATE V24 RESTORED: Closing all positions');
  
  try {
    // Сначала получаем список открытых позиций
    const positionsResponse = await handleGatePositions(apiKeys);
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
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const method = 'POST';
        const url = '/api/v4/futures/usdt/orders';
        
        const closeSize = -parseFloat(position.size); // Противоположное направление
        
        const closeBody = JSON.stringify({
          contract: position.contract,
          size: closeSize,
          price: '0', // Market order
          tif: 'ioc',
          reduce_only: true
        });
        
        const signature = await createGateSignature(method, url, '', closeBody, apiKeys.api_secret, timestamp);
        
        const response = await fetch(`https://api.gateio.ws${url}`, {
          method: method,
          headers: {
            'KEY': apiKeys.api_key,
            'SIGN': signature,
            'Timestamp': timestamp,
            'Content-Type': 'application/json'
          },
          body: closeBody
        });

        const data = await response.json();
        
        if (!response.ok) {
          closeResults.push({
            symbol: position.contract,
            success: false,
            error: data.message || 'Unknown error'
          });
          console.log(`❌ Error closing ${position.contract}: ${data.message}`);
        } else {
          closeResults.push({
            symbol: position.contract,
            success: true,
            order_id: data.id
          });
          console.log(`✅ Position ${position.contract} closed successfully`);
        }
        
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        closeResults.push({
          symbol: position.contract,
          success: false,
          error: error.message
        });
        console.log(`❌ Error closing ${position.contract}: ${error.message}`);
      }
    }
    
    const successCount = closeResults.filter(r => r.success).length;
    
    console.log(`🔵 GATE V24 RESTORED: Closed ${successCount} of ${closeResults.length} positions`);
    
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
    console.error('❌ GATE V24 RESTORED Close positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Gate.io close positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена ордеров
async function handleGateCancelOrders(apiKeys: any) {
  console.log('🔵 GATE V24 RESTORED: Canceling orders');
  
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'DELETE';
    const url = '/api/v4/futures/usdt/orders';
    const queryString = '';
    const body = '';
    
    const signature = await createGateSignature(method, url, queryString, body, apiKeys.api_secret, timestamp);
    
    const response = await fetch(`https://api.gateio.ws${url}`, {
      method: method,
      headers: {
        'KEY': apiKeys.api_key,
        'SIGN': signature,
        'Timestamp': timestamp,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Gate.io cancel error: ${data.message || 'Unknown error'}`);
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
    console.error('❌ GATE V24 RESTORED Cancel orders error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Gate.io cancel orders error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}