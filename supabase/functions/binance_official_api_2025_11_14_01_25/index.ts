import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, user_id, amount, leverage, symbol, side, stopLoss, takeProfit } = await req.json();
    console.log(`🔥 BINANCE OFFICIAL API:`, { action, amount, leverage, symbol, user_id });

    // Получаем API ключи из правильной таблицы
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys_2025_11_12_05_30')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'binance')
      .single();

    if (keysError || !apiKeys) {
      console.log('❌ Binance keys not found');
      return new Response(
        JSON.stringify({ success: false, error: 'Binance API ключи не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Keys found: ${apiKeys.api_key.substring(0, 10)}...`);

    // РАСЧЕТ ПОЗИЦИИ ПО ПАРАМЕТРАМ ФРОНТЕНДА
    const marginAmount = parseFloat(amount || "10");
    const leverageValue = parseFloat(leverage || "10");
    const positionSizeUSD = marginAmount * leverageValue;
    
    console.log(`💰 POSITION CALC: ${marginAmount} * ${leverageValue} = ${positionSizeUSD} USD`);

    // Проверяем минимум для Binance Futures
    if (positionSizeUSD < 5) {
      return new Response(
        JSON.stringify({ success: false, error: `Position size ${positionSizeUSD} USD < 5 USD minimum for Binance Futures` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const symbolToUse = symbol || "BTCUSDT";

    // 1. Получаем информацию о символе
    const exchangeInfoResponse = await fetch(`https://fapi.binance.com/fapi/v1/exchangeInfo`);
    const exchangeInfo = await exchangeInfoResponse.json();
    
    const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbolToUse);
    if (!symbolInfo) {
      throw new Error(`Symbol ${symbolToUse} not found`);
    }

    // 2. Получаем текущую цену
    const tickerResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbolToUse}`);
    const tickerData = await tickerResponse.json();
    const currentPrice = parseFloat(tickerData.price);
    
    console.log(`📊 Current Price: ${currentPrice}`);

    // 3. Рассчитываем quantity
    const quantity = positionSizeUSD / currentPrice;
    
    // 4. Получаем фильтры для правильного форматирования
    const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
    const stepSize = parseFloat(lotSizeFilter?.stepSize || '0.001');
    const quantityPrecision = symbolInfo.quantityPrecision || 3;
    
    // 5. Округляем quantity согласно stepSize
    const adjustedQuantity = Math.floor(quantity / stepSize) * stepSize;
    const formattedQuantity = adjustedQuantity.toFixed(quantityPrecision);
    
    console.log(`🎯 Quantity: ${formattedQuantity}`);

    // 6. Проверяем notional value
    const notionalValue = adjustedQuantity * currentPrice;
    console.log(`💵 Notional: ${notionalValue}`);

    if (notionalValue < 5) {
      return new Response(
        JSON.stringify({ success: false, error: `Notional value ${notionalValue} < 5 USD minimum` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Устанавливаем плечо (leverage)
    const timestamp1 = Date.now();
    const leverageParams = `symbol=${symbolToUse}&leverage=${leverageValue}&timestamp=${timestamp1}`;
    const leverageSignature = await createSignature(leverageParams, apiKeys.secret);
    
    const leverageResponse = await fetch(`https://fapi.binance.com/fapi/v1/leverage`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${leverageParams}&signature=${leverageSignature}`
    });
    
    const leverageResult = await leverageResponse.json();
    console.log('🔧 Leverage set:', leverageResult);

    // 8. Размещаем MARKET ордер (по официальной документации)
    const timestamp2 = Date.now();
    const orderSide = side === 'SHORT' ? 'SELL' : 'BUY';
    
    // Параметры для MARKET ордера согласно официальной документации
    const orderParams = `symbol=${symbolToUse}&side=${orderSide}&type=MARKET&quantity=${formattedQuantity}&timestamp=${timestamp2}`;
    const orderSignature = await createSignature(orderParams, apiKeys.secret);
    
    console.log(`📋 Order params: ${orderParams}`);
    
    const orderResponse = await fetch(`https://fapi.binance.com/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${orderParams}&signature=${orderSignature}`
    });
    
    const orderResult = await orderResponse.json();
    console.log('🎯 Order result:', orderResult);
    
    if (orderResult.orderId) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `🎉 BINANCE FUTURES ORDER: ${orderResult.orderId}`,
          order: {
            orderId: orderResult.orderId,
            symbol: symbolToUse,
            side: orderSide,
            quantity: formattedQuantity,
            positionSize: positionSizeUSD,
            leverage: leverageValue,
            price: currentPrice,
            notional: notionalValue,
            status: orderResult.status,
            exchange: 'BINANCE FUTURES OFFICIAL API'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      throw new Error(`Order failed: ${orderResult.msg || JSON.stringify(orderResult)}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: `Error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Создание подписи по официальной документации Binance
async function createSignature(queryString: string, apiSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(queryString);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}
