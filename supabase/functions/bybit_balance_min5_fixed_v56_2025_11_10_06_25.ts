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

    const { action, user_id, order_type = 'LONG', position, ...params } = await req.json();

    console.log(`🟠 BYBIT BALANCE FIXED: ${action} - ${order_type} direction`);

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
      
      case 'close_individual_position':
        return await handleBybitCloseIndividualPosition(apiKeys, position);
      
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
    console.error('❌ BYBIT BALANCE FIXED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Функция создания подписи для Bybit API
async function createBybitSignature(timestamp: string, apiKey: string, recvWindow: string, params: string, secret: string): Promise<string> {
  const message = timestamp + apiKey + recvWindow + params;
  
  console.log(`🔐 BYBIT BALANCE FIXED: Creating signature with message: ${message.substring(0, 100)}...`);
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
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
  
  console.log(`🔐 BYBIT BALANCE FIXED: Generated signature: ${hexSignature.substring(0, 16)}...`);
  
  return hexSignature;
}

// ИСПРАВЛЕННАЯ функция получения баланса
async function handleBybitBalance(apiKeys: any) {
  console.log('🟠 BYBIT BALANCE FIXED: Getting balance');
  
  try {
    const timestamp = Date.now().toString();
    const recv_window = '5000';
    const params = 'accountType=UNIFIED';
    
    const signature = await createBybitSignature(timestamp, apiKeys.api_key, recv_window, params, apiKeys.api_secret);
    
    const response = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${params}`, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recv_window,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    console.log('🟠 BYBIT BALANCE FIXED: API Response:', JSON.stringify(data, null, 2));
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }

    // Извлекаем USDT баланс из UNIFIED аккаунта
    const unifiedAccount = data.result?.list?.[0];
    const usdtCoin = unifiedAccount?.coin?.find((coin: any) => coin.coin === 'USDT');
    const balance = parseFloat(usdtCoin?.availableToWithdraw || '0');
    
    console.log('🟠 BYBIT BALANCE FIXED: Balance extracted:', balance);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        balance: balance,
        raw_data: data.result 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT BALANCE FIXED error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit balance error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ИСПРАВЛЕННАЯ функция размещения ордера с минимумом 5 USDT
async function handleBybitOrderWithTPSL(apiKeys: any, settings: any, orderType: string = 'LONG') {
  console.log(`🟠 BYBIT BALANCE FIXED: Placing ${orderType} order with TP/SL`);
  
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
    
    // Рассчитываем размер позиции с минимумом 5 USDT
    let positionSize = availableBalance * riskPercent * leverage;
    
    // КРИТИЧЕСКИ ВАЖНО: Минимум 5 USDT для Bybit
    if (positionSize < 5) {
      positionSize = 5;
      console.log('🟠 BYBIT BALANCE FIXED: Position size increased to minimum 5 USDT');
    }
    
    positionSize = parseFloat(positionSize.toFixed(2));
    
    console.log(`🟠 BYBIT BALANCE FIXED: Balance: ${availableBalance}, Leverage: ${leverage}x, Risk: ${riskPercent * 100}%, Size: ${positionSize}`);
    
    // Получаем текущую цену для настроенного символа
    const symbol = settings?.symbol || 'BTCUSDT';
    const tickerResponse = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
    const tickerData = await tickerResponse.json();
    
    if (tickerData.retCode !== 0 || !tickerData.result?.list?.[0]) {
      throw new Error(`Не удалось получить цену для ${symbol}`);
    }
    
    const currentPrice = parseFloat(tickerData.result.list[0].lastPrice);
    
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
    
    console.log(`🟠 BYBIT BALANCE FIXED: Symbol: ${symbol}, Price: ${currentPrice}, TP: ${tpPrice}, SL: ${slPrice}`);
    
    const timestamp = Date.now().toString();
    const recv_window = '5000';
    
    // Параметры ордера
    const orderParams = {
      category: 'linear',
      symbol: symbol,
      side: orderType === 'LONG' ? 'Buy' : 'Sell',
      orderType: 'Market',
      qty: positionSize.toString(),
      takeProfit: tpPrice,
      stopLoss: slPrice
    };
    
    const bodyString = JSON.stringify(orderParams);
    
    const signature = await createBybitSignature(timestamp, apiKeys.api_key, recv_window, bodyString, apiKeys.api_secret);
    
    const response = await fetch('https://api.bybit.com/v5/order/create', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recv_window,
        'Content-Type': 'application/json'
      },
      body: bodyString
    });

    const data = await response.json();
    
    console.log('🟠 BYBIT BALANCE FIXED: Order response:', JSON.stringify(data, null, 2));
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit order error: ${data.retMsg}`);
    }

    console.log('🟠 BYBIT BALANCE FIXED: Order placed successfully');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: data.result.orderId,
        symbol: symbol,
        side: orderType,
        qty: positionSize.toString(),
        price: currentPrice,
        take_profit: tpPrice,
        stop_loss: slPrice
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT BALANCE FIXED Order error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit order error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Получение позиций
async function handleBybitPositions(apiKeys: any) {
  console.log('🟠 BYBIT BALANCE FIXED: Getting positions');
  
  try {
    const timestamp = Date.now().toString();
    const recv_window = '5000';
    const params = 'category=linear&settleCoin=USDT';
    
    const signature = await createBybitSignature(timestamp, apiKeys.api_key, recv_window, params, apiKeys.api_secret);
    
    const response = await fetch(`https://api.bybit.com/v5/position/list?${params}`, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recv_window,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit positions error: ${data.retMsg}`);
    }

    // Фильтруем только открытые позиции
    const openPositions = data.result?.list?.filter((pos: any) => parseFloat(pos.size) > 0) || [];
    
    console.log(`🟠 BYBIT BALANCE FIXED: Found ${openPositions.length} open positions`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ BYBIT BALANCE FIXED Positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Закрытие всех позиций
async function handleBybitClosePositions(apiKeys: any) {
  console.log('🟠 BYBIT BALANCE FIXED: Closing all positions');
  
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
        const positionSize = parseFloat(position.size);
        const closeSide = position.side === 'Buy' ? 'Sell' : 'Buy';
        
        const timestamp = Date.now().toString();
        const recv_window = '5000';
        
        const closeParams = {
          category: 'linear',
          symbol: position.symbol,
          side: closeSide,
          orderType: 'Market',
          qty: positionSize.toString(),
          reduceOnly: true
        };
        
        const closeBodyString = JSON.stringify(closeParams);
        
        const signature = await createBybitSignature(timestamp, apiKeys.api_key, recv_window, closeBodyString, apiKeys.api_secret);
        
        const response = await fetch('https://api.bybit.com/v5/order/create', {
          method: 'POST',
          headers: {
            'X-BAPI-API-KEY': apiKeys.api_key,
            'X-BAPI-SIGN': signature,
            'X-BAPI-SIGN-TYPE': '2',
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-RECV-WINDOW': recv_window,
            'Content-Type': 'application/json'
          },
          body: closeBodyString
        });

        const data = await response.json();
        
        if (data.retCode === 0) {
          closeResults.push({
            symbol: position.symbol,
            success: true,
            order_id: data.result.orderId
          });
          console.log(`✅ Position ${position.symbol} closed successfully`);
        } else {
          closeResults.push({
            symbol: position.symbol,
            success: false,
            error: data.retMsg
          });
          console.log(`❌ Error closing ${position.symbol}: ${data.retMsg}`);
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
    
    console.log(`🟠 BYBIT BALANCE FIXED: Closed ${successCount} of ${closeResults.length} positions`);
    
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
    console.error('❌ BYBIT BALANCE FIXED Close positions error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit close positions error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Закрытие индивидуальной позиции
async function handleBybitCloseIndividualPosition(apiKeys: any, position: any) {
  console.log('🟠 BYBIT BALANCE FIXED: Closing individual position:', position?.symbol);
  
  if (!position || !position.symbol) {
    return new Response(
      JSON.stringify({ success: false, error: 'Позиция не указана' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    const positionSize = parseFloat(position.size);
    const closeSide = position.side === 'Buy' ? 'Sell' : 'Buy';
    
    const timestamp = Date.now().toString();
    const recv_window = '5000';
    
    const closeParams = {
      category: 'linear',
      symbol: position.symbol,
      side: closeSide,
      orderType: 'Market',
      qty: Math.abs(positionSize).toString(),
      reduceOnly: true
    };
    
    const closeBodyString = JSON.stringify(closeParams);
    
    const signature = await createBybitSignature(timestamp, apiKeys.api_key, recv_window, closeBodyString, apiKeys.api_secret);
    
    const response = await fetch('https://api.bybit.com/v5/order/create', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recv_window,
        'Content-Type': 'application/json'
      },
      body: closeBodyString
    });
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit close error: ${data.retMsg}`);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `✅ Позиция ${position.symbol} закрыта`,
        order_id: data.result.orderId,
        symbol: position.symbol,
        original_size: positionSize,
        close_side: closeSide
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ BYBIT BALANCE FIXED Close individual position error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit close position error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Отмена ордеров
async function handleBybitCancelOrders(apiKeys: any) {
  console.log('🟠 BYBIT BALANCE FIXED: Canceling orders');
  
  try {
    const timestamp = Date.now().toString();
    const recv_window = '5000';
    
    const cancelParams = {
      category: 'linear'
    };
    
    const bodyString = JSON.stringify(cancelParams);
    
    const signature = await createBybitSignature(timestamp, apiKeys.api_key, recv_window, bodyString, apiKeys.api_secret);
    
    const response = await fetch('https://api.bybit.com/v5/order/cancel-all', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recv_window,
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
    console.error('❌ BYBIT BALANCE FIXED Cancel orders error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: `Bybit cancel orders error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}