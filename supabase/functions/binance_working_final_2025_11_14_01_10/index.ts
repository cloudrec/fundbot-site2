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
    console.log(`🔥 BINANCE FINAL: Received`, { action, amount, leverage, symbol, user_id });

    // Получаем API ключи из ПРАВИЛЬНОЙ ТАБЛИЦЫ
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys_2025_11_12_05_30')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'binance')
      .single();

    if (keysError || !apiKeys) {
      console.log('❌ Keys not found');
      return new Response(
        JSON.stringify({ success: false, error: 'Binance ключи не найдены' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Keys found: ${apiKeys.api_key.substring(0, 10)}...`);

    // ПРЯМОЙ РАСЧЕТ БЕЗ БАЛАНСА
    const marginAmount = parseFloat(amount || "10");
    const leverageValue = parseFloat(leverage || "10");
    const positionSizeUSD = marginAmount * leverageValue;
    
    console.log(`💰 CALC: ${marginAmount} * ${leverageValue} = ${positionSizeUSD} USD`);

    if (positionSizeUSD < 100) {
      return new Response(
        JSON.stringify({ success: false, error: `Position size ${positionSizeUSD} USD < 100 USD minimum` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const symbolToUse = symbol || "BTCUSDT";

    // Получаем цену
    const tickerResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbolToUse}`);
    const tickerData = await tickerResponse.json();
    const currentPrice = parseFloat(tickerData.price);
    
    console.log(`📊 Price: ${currentPrice}`);

    // Рассчитываем quantity
    const quantity = positionSizeUSD / currentPrice;
    const formattedQuantity = quantity.toFixed(3);
    
    console.log(`🎯 Quantity: ${formattedQuantity}`);

    // Проверяем notional
    const notionalValue = quantity * currentPrice;
    console.log(`💵 Notional: ${notionalValue}`);

    if (notionalValue < 100) {
      return new Response(
        JSON.stringify({ success: false, error: `Notional ${notionalValue} < 100` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Устанавливаем плечо
    const timestamp1 = Date.now();
    const leverageParams = `symbol=${symbolToUse}&leverage=${leverageValue}&timestamp=${timestamp1}`;
    const leverageSignature = await createSignature(leverageParams, apiKeys.secret);
    
    await fetch(`https://fapi.binance.com/fapi/v1/leverage`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${leverageParams}&signature=${leverageSignature}`
    });

    // Размещаем ордер
    const timestamp2 = Date.now();
    const orderSide = 'BUY';
    const orderParams = `symbol=${symbolToUse}&side=${orderSide}&type=MARKET&quantity=${formattedQuantity}&timestamp=${timestamp2}`;
    const orderSignature = await createSignature(orderParams, apiKeys.secret);
    
    const orderResponse = await fetch(`https://fapi.binance.com/fapi/v1/order`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${orderParams}&signature=${orderSignature}`
    });
    
    const orderResult = await orderResponse.json();
    console.log('📋 Order result:', orderResult);
    
    if (orderResult.orderId) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `🎉 BINANCE ORDER: ${orderResult.orderId}`,
          order: {
            orderId: orderResult.orderId,
            symbol: symbolToUse,
            quantity: formattedQuantity,
            positionSize: positionSizeUSD,
            leverage: leverageValue,
            price: currentPrice,
            notional: notionalValue
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

async function createSignature(queryString: string, apiSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(queryString);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}
