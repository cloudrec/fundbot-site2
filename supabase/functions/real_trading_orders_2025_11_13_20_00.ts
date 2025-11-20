import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
}

// Функция для создания подписи Bybit
function createBybitSignature(params: string, secret: string, timestamp: string): string {
  const encoder = new TextEncoder()
  const data = encoder.encode(timestamp + 'YOUR_API_KEY' + '5000' + params)
  const key = encoder.encode(secret)
  
  return crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(cryptoKey => 
    crypto.subtle.sign('HMAC', cryptoKey, data)
  ).then(signature => 
    Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, exchange, symbol, side, amount, leverage, tpPercent, slPercent, user_id } = await req.json()
    console.log(`🚀 Real Trading: ${action} on ${exchange}`)

    // Получаем API ключи пользователя
    const { data: apiKeys, error: apiError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', exchange.toLowerCase())
      .eq('is_active', true)
      .single()

    if (apiError || !apiKeys) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `API ключи не найдены для биржи ${exchange.toUpperCase()}. Добавьте их в разделе API Ключи.` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let result: any = {}

    if (action === 'place_order' && exchange.toLowerCase() === 'bybit') {
      // РЕАЛЬНЫЙ ОРДЕР НА BYBIT
      const timestamp = Date.now().toString()
      
      // Получаем текущую цену
      const tickerResponse = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`)
      const tickerData = await tickerResponse.json()
      const currentPrice = parseFloat(tickerData.result.list[0].lastPrice)
      
      // Рассчитываем TP/SL цены
      const tpPrice = side === 'Buy' 
        ? currentPrice * (1 + parseFloat(tpPercent) / 100)
        : currentPrice * (1 - parseFloat(tpPercent) / 100)
        
      const slPrice = side === 'Buy'
        ? currentPrice * (1 - parseFloat(slPercent) / 100) 
        : currentPrice * (1 + parseFloat(slPercent) / 100)

      // Параметры ордера
      const orderParams = {
        category: 'linear',
        symbol: symbol,
        side: side,
        orderType: 'Market',
        qty: amount,
        timeInForce: 'IOC',
        takeProfit: tpPrice.toFixed(4),
        stopLoss: slPrice.toFixed(4)
      }

      const paramsString = Object.keys(orderParams)
        .sort()
        .map(key => `${key}=${orderParams[key as keyof typeof orderParams]}`)
        .join('&')

      // Создаем подпись
      const signature = await createBybitSignature(paramsString, apiKeys.api_secret, timestamp)

      // Отправляем ордер
      const orderResponse = await fetch('https://api.bybit.com/v5/order/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BAPI-API-KEY': apiKeys.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': '5000'
        },
        body: JSON.stringify(orderParams)
      })

      const orderData = await orderResponse.json()
      
      if (orderData.retCode === 0) {
        result = {
          success: true,
          message: `✅ Реальный ордер размещен на BYBIT: ${orderData.result.orderId}`,
          order: {
            orderId: orderData.result.orderId,
            symbol: symbol,
            side: side,
            leverage: leverage,
            amount: amount,
            takeProfit: tpPrice.toFixed(4),
            stopLoss: slPrice.toFixed(4),
            status: 'REAL ORDER PLACED',
            exchange: 'BYBIT',
            timestamp: new Date().toISOString()
          }
        }
      } else {
        throw new Error(`Bybit API Error: ${orderData.retMsg}`)
      }
    }
    else if (action === 'close_all_positions') {
      // ЗАКРЫТИЕ ВСЕХ ПОЗИЦИЙ
      result = { 
        success: true, 
        message: `Все позиции на ${exchange.toUpperCase()} будут закрыты (функция в разработке)`,
        action: 'close_positions'
      }
    }
    else if (action === 'cancel_all_orders') {
      // ОТМЕНА ВСЕХ ОРДЕРОВ  
      result = { 
        success: true, 
        message: `Все ордера на ${exchange.toUpperCase()} будут отменены (функция в разработке)`,
        action: 'cancel_orders'
      }
    }
    else {
      throw new Error(`Неизвестное действие: ${action}`)
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('❌ Real Trading Error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
