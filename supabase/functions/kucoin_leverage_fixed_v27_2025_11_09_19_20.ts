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

    console.log(`🟩 KUCOIN V27 RESTORED: ${action} - ${order_type} direction`);

    // Получаем API ключи пользователя
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'kucoin')
      .single();

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ success: false, error: 'KuCoin API ключи не найдены' }),
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
        return await handleKuCoinBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handleKuCoinOrderWithTPSL(apiKeys, settings, order_type);
      
      case 'get_positions':
        return await handleKuCoinPositions(apiKeys);
      
      case 'close_positions':
      case 'close_all_positions':
        return await handleKuCoinClosePositions(apiKeys);
      
      case 'cancel_orders':
      case 'cancel_all_orders':
        return await handleKuCoinCancelOrders(apiKeys);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ KUCOIN V27 RESTORED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Функция создания подписи для KuCoin API
async function createKuCoinSignature(timestamp: string, method: string, endpoint: string, body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(timestamp + method + endpoint + body);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return base64Signature;
}

// Получение баланса KuCoin
async function handleKuCoinBalance(apiKeys: any) {
  console.log('🟩 KUCOIN V27 RESTORED: Getting balance');
  
  try {
    const timestamp = Date.now().toString();
    const method = 'GET';
    const endpoint = '/api/v1/account-overview?currency=USDT';
    const body = '';
    
    const signature = await createKuCoinSignature(timestamp, method, endpoint, body, apiKeys.api_secret);
    const passphrase = await createKuCoinSignature(timestamp, method, endpoint, apiKeys.passphrase || '', apiKeys.api_secret);
    
    const response = await fetch(`https://api-futures.kucoin.com${endpoint}`, {
      method: method,
      headers: {
        'KC-API-KEY': apiKeys.api_key,
        'KC-API-SIGN': signature,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': passphrase,
        'KC-API-KEY-VERSION': '2',
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.code !== '200000') {
      throw new Error(`KuCoin API error: ${data.msg || 'Unknown error'}`);
    }

    const balance = parseFloat(data.data?.availableBalance || '0');
    
    console.log('🟩 KUCOIN V27 RESTORED: Balance extracted:', balance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: balance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ KUCOIN V27 RESTORED balance error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `KuCoin balance error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Размещение ордера с TP/SL (версия v27)
async function handleKuCoinOrderWithTPSL(apiKeys: any, settings: any, orderType: string = 'LONG') {
  console.log(`🟩 KUCOIN V27 RESTORED: Placing ${orderType} order with TP/SL`);
  
  try {
    // Получаем баланс для расчета размера позиции
    const balanceResponse = await handleKuCoinBalance(apiKeys);
    const balanceData = await balanceResponse.json();
    
    if (!balanceData.success) {
      throw new Error('Не удалось получить баланс');
    }
    
    const availableBalance = balanceData.balance;
    const leverage = parseInt(settings?.leverage || '10');
    const riskPercent = parseFloat(settings?.risk_percent || '2') / 100;
    
    // Рассчитываем размер позиции в USDT
    let positionSize = availableBalance * riskPercent * leverage;
    
    // Минимум 1 USDT для KuCoin
    if (positionSize < 1) {
      positionSize = 1;
      console.log('🟩 KUCOIN V27 RESTORED: Position size increased to minimum 1 USDT');
    }
    
    console.log(`🟩 KUCOIN V27 RESTORED: Balance: ${availableBalance}, Leverage: ${leverage}x, Risk: ${riskPercent * 100}%, Position Size: ${positionSize} USDT`);
    
    // Получаем текущую цену для настроенного символа
    const symbol = settings?.symbol || 'XBTUSDTM';
    const tickerResponse = await fetch(`https://api-futures.kucoin.com/api/v1/ticker?symbol=${symbol}`);
    const tickerData = await tickerResponse.json();
    
    if (tickerData.code !== '200000') {
      throw new Error(`Не удалось получить цену для ${symbol}: ${tickerData.msg}`);
    }
    
    const currentPrice = parseFloat(tickerData.data.price);
    
    // Рассчитываем quantity (исправленный расчет для KuCoin)
    const rawQuantity = Math.floor(positionSize / currentPrice);
    const finalQuantity = Math.max(rawQuantity, 1); // Минимум 1 контракт
    
    console.log(`🟩 KUCOIN V27 RESTORED: Price: ${currentPrice}, Raw Quantity: ${rawQuantity}, Final Quantity: ${finalQuantity}`);
    
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
    
    console.log(`🟩 KUCOIN V27 RESTORED: TP: ${tpPrice}, SL: ${slPrice}, Quantity: ${finalQuantity}`);
    
    // 1. Размещаем основной ордер
    const timestamp1 = Date.now().toString();
    const method1 = 'POST';
    const endpoint1 = '/api/v1/orders';
    const body1 = JSON.stringify({
      clientOid: `order_${timestamp1}`,
      side: orderType === 'LONG' ? 'buy' : 'sell',
      symbol: symbol,
      type: 'market',
      leverage: leverage,
      size: finalQuantity
    });
    
    const signature1 = await createKuCoinSignature(timestamp1, method1, endpoint1, body1, apiKeys.api_secret);
    const passphrase1 = await createKuCoinSignature(timestamp1, method1, endpoint1, apiKeys.passphrase || '', apiKeys.api_secret);
    
    console.log(`🟩 KUCOIN V27 RESTORED: Order body: ${body1}`);
    
    const orderResponse = await fetch(`https://api-futures.kucoin.com${endpoint1}`, {
      method: method1,
      headers: {
        'KC-API-KEY': apiKeys.api_key,
        'KC-API-SIGN': signature1,
        'KC-API-TIMESTAMP': timestamp1,
        'KC-API-PASSPHRASE': passphrase1,
        'KC-API-KEY-VERSION': '2',
        'Content-Type': 'application/json'
      },
      body: body1
    });

    const orderData = await orderResponse.json();
    
    console.log('🟩 KUCOIN V27 RESTORED: Order response:', JSON.stringify(orderData, null, 2));
    
    if (orderData.code !== '200000') {
      throw new Error(`KuCoin order error: ${orderData.msg || 'Unknown error'}`);
    }

    console.log('🟩 KUCOIN V27 RESTORED: Main order placed successfully');
    
    // Небольшая задержка перед размещением TP/SL
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 2. Размещаем Take Profit ордер
    const timestamp2 = Date.now().toString();
    const tpBody = JSON.stringify({
      clientOid: `tp_${timestamp2}`,
      side: orderType === 'LONG' ? 'sell' : 'buy',
      symbol: symbol,
      type: 'limit',
      size: finalQuantity,
      price: tpPrice,
      reduceOnly: true
    });
    
    const signature2 = await createKuCoinSignature(timestamp2, method1, endpoint1, tpBody, apiKeys.api_secret);
    const passphrase2 = await createKuCoinSignature(timestamp2, method1, endpoint1, apiKeys.passphrase || '', apiKeys.api_secret);
    
    const tpResponse = await fetch(`https://api-futures.kucoin.com${endpoint1}`, {
      method: method1,
      headers: {
        'KC-API-KEY': apiKeys.api_key,
        'KC-API-SIGN': signature2,
        'KC-API-TIMESTAMP': timestamp2,
        'KC-API-PASSPHRASE': passphrase2,
        'KC-API-KEY-VERSION': '2',
        'Content-Type': 'application/json'
      },
      body: tpBody
    });

    const tpData = await tpResponse.json();
    
    if (tpData.code !== '200000') {
      console.log('⚠️ KUCOIN V27 RESTORED: TP order failed:', tpData.msg);
    } else {
      console.log('🟩 KUCOIN V27 RESTORED: TP order placed:', tpData.data.orderId);
    }
    
    // Небольшая задержка перед размещением SL
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 3. Размещаем Stop Loss ордер
    const timestamp3 = Date.now().toString();
    const slBody = JSON.stringify({
      clientOid: `sl_${timestamp3}`,
      side: orderType === 'LONG' ? 'sell' : 'buy',
      symbol: symbol,
      type: 'limit',
      size: finalQuantity,
      price: slPrice,
      reduceOnly: true
    });
    
    const signature3 = await createKuCoinSignature(timestamp3, method1, endpoint1, slBody, apiKeys.api_secret);
    const passphrase3 = await createKuCoinSignature(timestamp3, method1, endpoint1, apiKeys.passphrase || '', apiKeys.api_secret);
    
    const slResponse = await fetch(`https://api-futures.kucoin.com${endpoint1}`, {
      method: method1,
      headers: {
        'KC-API-KEY': apiKeys.api_key,
        'KC-API-SIGN': signature3,
        'KC-API-TIMESTAMP': timestamp3,
        'KC-API-PASSPHRASE': passphrase3,
        'KC-API-KEY-VERSION': '2',
        'Content-Type': 'application/json'
      },
      body: slBody
    });

    const slData = await slResponse.json();
    
    if (slData.code !== '200000') {
      console.log('⚠️ KUCOIN V27 RESTORED: SL order failed:', slData.msg);
    } else {
      console.log('🟩 KUCOIN V27 RESTORED: SL order placed:', slData.data.orderId);
    }
    
    console.log('🟩 KUCOIN V27 RESTORED: All orders completed');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        main_order_id: orderData.data.orderId,
        tp_order_id: tpData.data?.orderId || null,
        sl_order_id: slData.data?.orderId || null,
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
    console.error('❌ KUCOIN V27 RESTORED Order error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `KuCoin order error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций
async function handleKuCoinPositions(apiKeys: any) {
  console.log('🟩 KUCOIN V27 RESTORED: Getting positions');
  
  try {
    const timestamp = Date.now().toString();
    const method = 'GET';
    const endpoint = '/api/v1/positions';
    const body = '';
    
    const signature = await createKuCoinSignature(timestamp, method, endpoint, body, apiKeys.api_secret);
    const passphrase = await createKuCoinSignature(timestamp, method, endpoint, apiKeys.passphrase || '', apiKeys.api_secret);
    
    const response = await fetch(`https://api-futures.kucoin.com${endpoint}`, {
      method: method,
      headers: {
        'KC-API-KEY': apiKeys.api_key,
        'KC-API-SIGN': signature,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': passphrase,
        'KC-API-KEY-VERSION': '2',
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.code !== '200000') {
      throw new Error(`KuCoin positions error: ${data.msg || 'Unknown error'}`);
    }

    // Фильтруем только открытые позиции
    const openPositions = data.data.filter((pos: any) => parseFloat(pos.currentQty) !== 0);
    
    console.log(`🟩 KUCOIN V27 RESTORED: Found ${openPositions.length} open positions`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ KUCOIN V27 RESTORED Positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `KuCoin positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Закрытие всех позиций
async function handleKuCoinClosePositions(apiKeys: any) {
  console.log('🟩 KUCOIN V27 RESTORED: Closing all positions');
  
  try {
    // Сначала получаем список открытых позиций
    const positionsResponse = await handleKuCoinPositions(apiKeys);
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
        const method = 'POST';
        const endpoint = '/api/v1/orders';
        
        const currentQty = parseFloat(position.currentQty);
        const closeSide = currentQty > 0 ? 'sell' : 'buy';
        const closeSize = Math.abs(currentQty);
        
        const closeBody = JSON.stringify({
          clientOid: `close_${timestamp}`,
          side: closeSide,
          symbol: position.symbol,
          type: 'market',
          size: closeSize,
          reduceOnly: true
        });
        
        const signature = await createKuCoinSignature(timestamp, method, endpoint, closeBody, apiKeys.api_secret);
        const passphrase = await createKuCoinSignature(timestamp, method, endpoint, apiKeys.passphrase || '', apiKeys.api_secret);
        
        const response = await fetch(`https://api-futures.kucoin.com${endpoint}`, {
          method: method,
          headers: {
            'KC-API-KEY': apiKeys.api_key,
            'KC-API-SIGN': signature,
            'KC-API-TIMESTAMP': timestamp,
            'KC-API-PASSPHRASE': passphrase,
            'KC-API-KEY-VERSION': '2',
            'Content-Type': 'application/json'
          },
          body: closeBody
        });

        const data = await response.json();
        
        if (data.code !== '200000') {
          closeResults.push({
            symbol: position.symbol,
            success: false,
            error: data.msg || 'Unknown error'
          });
          console.log(`❌ Error closing ${position.symbol}: ${data.msg}`);
        } else {
          closeResults.push({
            symbol: position.symbol,
            success: true,
            order_id: data.data.orderId
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
    
    console.log(`🟩 KUCOIN V27 RESTORED: Closed ${successCount} of ${closeResults.length} positions`);
    
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
    console.error('❌ KUCOIN V27 RESTORED Close positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `KuCoin close positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена ордеров
async function handleKuCoinCancelOrders(apiKeys: any) {
  console.log('🟩 KUCOIN V27 RESTORED: Canceling orders');
  
  try {
    const timestamp = Date.now().toString();
    const method = 'DELETE';
    const endpoint = '/api/v1/orders';
    const body = '';
    
    const signature = await createKuCoinSignature(timestamp, method, endpoint, body, apiKeys.api_secret);
    const passphrase = await createKuCoinSignature(timestamp, method, endpoint, apiKeys.passphrase || '', apiKeys.api_secret);
    
    const response = await fetch(`https://api-futures.kucoin.com${endpoint}`, {
      method: method,
      headers: {
        'KC-API-KEY': apiKeys.api_key,
        'KC-API-SIGN': signature,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': passphrase,
        'KC-API-KEY-VERSION': '2',
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.code !== '200000') {
      throw new Error(`KuCoin cancel error: ${data.msg || 'Unknown error'}`);
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
    console.error('❌ KUCOIN V27 RESTORED Cancel orders error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `KuCoin cancel orders error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}