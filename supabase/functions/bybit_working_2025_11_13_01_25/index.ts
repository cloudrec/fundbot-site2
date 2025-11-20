import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { exchange, symbol, side, leverage, amount } = await req.json()
    
    console.log('📊 BYBIT ЗАПРОС:', { exchange, symbol, side, leverage, amount })

    // Получаем API ключи из Supabase
    const apiKey = Deno.env.get('BYBIT_API_KEY')
    const apiSecret = Deno.env.get('BYBIT_API_SECRET')
    
    if (!apiKey || !apiSecret) {
      throw new Error('Отсутствуют API ключи Bybit')
    }

    // Параметры для тестового ордера
    const timestamp = Date.now().toString()
    const params = {
      category: 'linear',
      symbol: symbol || 'BTCUSDT',
      side: side || 'Buy',
      orderType: 'Market',
      qty: amount || '0.001',
      timeInForce: 'IOC'
    }

    // Создаем строку для подписи
    const paramString = Object.keys(params)
      .sort()
      .map(key => )
      .join('&')
    
    const signString = timestamp + apiKey + '5000' + paramString
    const signature = createHmac('sha256', apiSecret).update(signString).digest('hex')

    console.log('🔐 ПОДПИСЬ СОЗДАНА')

    // Отправляем тестовый запрос к Bybit
    const response = await fetch('https://api-testnet.bybit.com/v5/order/create', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': '5000',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params)
    })

    const result = await response.json()
    console.log('📈 BYBIT ОТВЕТ:', result)

    if (result.retCode === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Тестовый ордер размещен на Bybit!',
        orderId: result.result?.orderId,
        data: result
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: ,
        error: result
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

  } catch (error) {
    console.error('❌ ОШИБКА:', error)
    return new Response(JSON.stringify({
      success: false,
      message: ,
      error: error.toString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
