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

    console.log(`🔵 OKX V27 RESTORED: ${action} - ${order_type} direction`);

    // Получаем API ключи пользователя
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'okx')
      .single();

    if (keysError || !apiKeys) {
      return new Response(
        JSON.stringify({ success: false, error: 'OKX API ключи не найдены' }),
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
        return await handleOKXBalance(apiKeys);
      
      case 'place_order_with_tp_sl':
        return await handleOKXOrderWithTPSL(apiKeys, settings, order_type);
      
      case 'get_positions':
        return await handleOKXPositions(apiKeys);
      
      case 'close_positions':
      case 'close_all_positions':
        return await handleOKXClosePositions(apiKeys);
      
      case 'cancel_orders':
      case 'cancel_all_orders':
        return await handleOKXCancelOrders(apiKeys);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Неизвестное действие: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ OKX V27 RESTORED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Функция создания подписи для OKX API
async function createOKXSignature(timestamp: string, method: string, requestPath: string, body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(timestamp + method + requestPath + body);
  
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

// Получение баланса OKX
async function handleOKXBalance(apiKeys: any) {
  console.log('🔵 OKX V27 RESTORED: Getting balance');
  
  try {
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const requestPath = '/api/v5/account/balance?ccy=USDT';
    const body = '';
    
    const signature = await createOKXSignature(timestamp, method, requestPath, body, apiKeys.api_secret);
    
    const response = await fetch(`https://www.okx.com${requestPath}`, {
      method: method,
      headers: {
        'OK-ACCESS-KEY': apiKeys.api_key,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': apiKeys.passphrase || '',
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.code !== '0') {
      throw new Error(`OKX API error: ${data.msg || 'Unknown error'}`);
    }

    const usdtBalance = data.data?.[0]?.details?.find((d: any) => d.ccy === 'USDT');
    const balance = parseFloat(usdtBalance?.availBal || '0');
    
    console.log('🔵 OKX V27 RESTORED: Balance extracted:', balance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: balance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ OKX V27 RESTORED balance error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `OKX balance error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Размещение ордера с TP/SL (версия v27)
async function handleOKXOrderWithTPSL(apiKeys: any, settings: any, orderType: string = 'LONG') {
  console.log(`🔵 OKX V27 RESTORED: Placing ${orderType} order with TP/SL`);
  
  try {
    // Получаем баланс для расчета размера позиции
    const balanceResponse = await handleOKXBalance(apiKeys);
    const balanceData = await balanceResponse.json();
    
    if (!balanceData.success) {
      throw new Error('Не удалось получить баланс');
    }
    
    const availableBalance = balanceData.balance;
    const leverage = parseInt(settings?.leverage || '10');
    const riskPercent = parseFloat(settings?.risk_percent || '2') / 100;
    
    // Рассчитываем размер позиции в USDT
    let positionSize = availableBalance * riskPercent * leverage;
    
    // Минимум 1 USDT для OKX
    if (positionSize < 1) {
      positionSize = 1;
      console.log('🔵 OKX V27 RESTORED: Position size increased to minimum 1 USDT');
    }
    
    console.log(`🔵 OKX V27 RESTORED: Balance: ${availableBalance}, Leverage: ${leverage}x, Risk: ${riskPercent * 100}%, Position Size: ${positionSize} USDT`);
    
    // Получаем текущую цену для настроенного символа (исправленный символ)
    const symbol = settings?.symbol || 'BTC-USDT-SWAP';
    const tickerResponse = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}`);
    const tickerData = await tickerResponse.json();
    
    if (tickerData.code !== '0' || !tickerData.data || tickerData.data.length === 0) {
      throw new Error(`Не удалось получить цену для ${symbol}: ${tickerData.msg}`);
    }
    
    const currentPrice = parseFloat(tickerData.data[0].last);
    
    // Рассчитываем quantity
    const rawQuantity = positionSize / currentPrice;
    const finalQuantity = parseFloat(rawQuantity.toFixed(6));
    
    console.log(`🔵 OKX V27 RESTORED: Price: ${currentPrice}, Raw Quantity: ${rawQuantity}, Final Quantity: ${finalQuantity}`);
    
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
    
    console.log(`🔵 OKX V27 RESTORED: TP: ${tpPrice}, SL: ${slPrice}, Quantity: ${finalQuantity}`);
    
    // 1. Размещаем основной ордер
    const timestamp1 = new Date().toISOString();
    const method1 = 'POST';
    const requestPath1 = '/api/v5/trade/order';
    const body1 = JSON.stringify({
      instId: symbol,
      tdMode: 'cross',
      side: orderType === 'LONG' ? 'buy' : 'sell',
      ordType: 'market',
      sz: finalQuantity.toString(),
      tpTriggerPx: tpPrice,
      tpOrdPx: '-1',
      slTriggerPx: slPrice,
      slOrdPx: '-1'
    });
    
    const signature1 = await createOKXSignature(timestamp1, method1, requestPath1, body1, apiKeys.api_secret);
    
    console.log(`🔵 OKX V27 RESTORED: Order body: ${body1}`);
    
    const orderResponse = await fetch(`https://www.okx.com${requestPath1}`, {
      method: method1,
      headers: {
        'OK-ACCESS-KEY': apiKeys.api_key,
        'OK-ACCESS-SIGN': signature1,
        'OK-ACCESS-TIMESTAMP': timestamp1,
        'OK-ACCESS-PASSPHRASE': apiKeys.passphrase || '',
        'Content-Type': 'application/json'
      },
      body: body1
    });

    const orderData = await orderResponse.json();
    
    console.log('🔵 OKX V27 RESTORED: Order response:', JSON.stringify(orderData, null, 2));
    
    if (orderData.code !== '0') {
      throw new Error(`OKX order error: ${orderData.msg || 'Unknown error'}`);
    }

    console.log('🔵 OKX V27 RESTORED: Order placed successfully with TP/SL');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: orderData.data[0].ordId,
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
    console.error('❌ OKX V27 RESTORED Order error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `OKX order error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций
async function handleOKXPositions(apiKeys: any) {
  console.log('🔵 OKX V27 RESTORED: Getting positions');
  
  try {
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const requestPath = '/api/v5/account/positions';
    const body = '';
    
    const signature = await createOKXSignature(timestamp, method, requestPath, body, apiKeys.api_secret);
    
    const response = await fetch(`https://www.okx.com${requestPath}`, {
      method: method,
      headers: {
        'OK-ACCESS-KEY': apiKeys.api_key,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': apiKeys.passphrase || '',
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.code !== '0') {
      throw new Error(`OKX positions error: ${data.msg || 'Unknown error'}`);
    }

    // Фильтруем только открытые позиции
    const openPositions = data.data.filter((pos: any) => parseFloat(pos.pos) !== 0);
    
    console.log(`🔵 OKX V27 RESTORED: Found ${openPositions.length} open positions`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ OKX V27 RESTORED Positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `OKX positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Закрытие всех позиций
async function handleOKXClosePositions(apiKeys: any) {
  console.log('🔵 OKX V27 RESTORED: Closing all positions');
  
  try {
    // Сначала получаем список открытых позиций
    const positionsResponse = await handleOKXPositions(apiKeys);
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
        const timestamp = new Date().toISOString();
        const method = 'POST';
        const requestPath = '/api/v5/trade/close-position';
        
        const closeBody = JSON.stringify({
          instId: position.instId,
          mgnMode: position.mgnMode
        });
        
        const signature = await createOKXSignature(timestamp, method, requestPath, closeBody, apiKeys.api_secret);
        
        const response = await fetch(`https://www.okx.com${requestPath}`, {
          method: method,
          headers: {
            'OK-ACCESS-KEY': apiKeys.api_key,
            'OK-ACCESS-SIGN': signature,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': apiKeys.passphrase || '',
            'Content-Type': 'application/json'
          },
          body: closeBody
        });

        const data = await response.json();
        
        if (data.code !== '0') {
          closeResults.push({
            symbol: position.instId,
            success: false,
            error: data.msg || 'Unknown error'
          });
          console.log(`❌ Error closing ${position.instId}: ${data.msg}`);
        } else {
          closeResults.push({
            symbol: position.instId,
            success: true,
            order_id: data.data[0]?.ordId
          });
          console.log(`✅ Position ${position.instId} closed successfully`);
        }
        
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        closeResults.push({
          symbol: position.instId,
          success: false,
          error: error.message
        });
        console.log(`❌ Error closing ${position.instId}: ${error.message}`);
      }
    }
    
    const successCount = closeResults.filter(r => r.success).length;
    
    console.log(`🔵 OKX V27 RESTORED: Closed ${successCount} of ${closeResults.length} positions`);
    
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
    console.error('❌ OKX V27 RESTORED Close positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `OKX close positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена ордеров
async function handleOKXCancelOrders(apiKeys: any) {
  console.log('🔵 OKX V27 RESTORED: Canceling orders');
  
  try {
    const timestamp = new Date().toISOString();
    const method = 'POST';
    const requestPath = '/api/v5/trade/cancel-all-after';
    const body = JSON.stringify({
      timeOut: '0' // Cancel all orders immediately
    });
    
    const signature = await createOKXSignature(timestamp, method, requestPath, body, apiKeys.api_secret);
    
    const response = await fetch(`https://www.okx.com${requestPath}`, {
      method: method,
      headers: {
        'OK-ACCESS-KEY': apiKeys.api_key,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': apiKeys.passphrase || '',
        'Content-Type': 'application/json'
      },
      body: body
    });

    const data = await response.json();
    
    if (data.code !== '0') {
      throw new Error(`OKX cancel error: ${data.msg || 'Unknown error'}`);
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
    console.error('❌ OKX V27 RESTORED Cancel orders error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `OKX cancel orders error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}