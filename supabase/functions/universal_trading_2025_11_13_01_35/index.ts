import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
}

// Универсальная функция для торговли на всех биржах
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { exchange, symbol, side, leverage, amount } = await req.json()
    
    console.log(, { exchange, symbol, side, leverage, amount })

    // Получаем API ключи для конкретной биржи
    const apiKey = Deno.env.get()
    const apiSecret = Deno.env.get()
    
    if (!apiKey || !apiSecret) {
      throw new Error()
    }

    let result
    
    switch (exchange.toLowerCase()) {
      case 'bybit':
        result = await placeBybitOrder(apiKey, apiSecret, symbol, side, amount)
        break
      case 'binance':
        result = await placeBinanceOrder(apiKey, apiSecret, symbol, side, amount)
        break
      case 'gate':
        result = await placeGateOrder(apiKey, apiSecret, symbol, side, amount)
        break
      case 'huobi':
        result = await placeHuobiOrder(apiKey, apiSecret, symbol, side, amount)
        break
      case 'okx':
        result = await placeOKXOrder(apiKey, apiSecret, symbol, side, amount)
        break
      case 'bitget':
        result = await placeBitgetOrder(apiKey, apiSecret, symbol, side, amount)
        break
      case 'kucoin':
        result = await placeKuCoinOrder(apiKey, apiSecret, symbol, side, amount)
        break
      case 'mexc':
        result = await placeMEXCOrder(apiKey, apiSecret, symbol, side, amount)
        break
      default:
        throw new Error()
    }

    return new Response(JSON.stringify({
      success: true,
      message: ,
      data: result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

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

// Bybit API
async function placeBybitOrder(apiKey: string, apiSecret: string, symbol: string, side: string, amount: string) {
  const timestamp = Date.now().toString()
  const params = {
    category: 'linear',
    symbol: symbol || 'BTCUSDT',
    side: side || 'Buy',
    orderType: 'Market',
    qty: amount || '0.001',
    timeInForce: 'IOC'
  }

  const paramString = Object.keys(params)
    .sort()
    .map(key => )
    .join('&')
  
  const signString = timestamp + apiKey + '5000' + paramString
  const signature = createHmac('sha256', apiSecret).update(signString).digest('hex')

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

  return await response.json()
}

// Binance API
async function placeBinanceOrder(apiKey: string, apiSecret: string, symbol: string, side: string, amount: string) {
  const timestamp = Date.now()
  const params = new URLSearchParams({
    symbol: symbol || 'BTCUSDT',
    side: side || 'BUY',
    type: 'MARKET',
    quantity: amount || '0.001',
    timestamp: timestamp.toString()
  })

  const signature = createHmac('sha256', apiSecret).update(params.toString()).digest('hex')
  params.append('signature', signature)

  const response = await fetch('https://testnet.binance.vision/api/v3/order', {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params
  })

  return await response.json()
}

// Gate.io API
async function placeGateOrder(apiKey: string, apiSecret: string, symbol: string, side: string, amount: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const method = 'POST'
  const url = '/spot/orders'
  const body = JSON.stringify({
    currency_pair: symbol || 'BTC_USDT',
    side: side?.toLowerCase() || 'buy',
    type: 'market',
    amount: amount || '0.001'
  })

  const signString = method + '\n' + url + '\n' + '\n' + body + '\n' + timestamp
  const signature = createHmac('sha512', apiSecret).update(signString).digest('hex')

  const response = await fetch('https://api.gateio.ws/api/v4/spot/orders', {
    method: 'POST',
    headers: {
      'KEY': apiKey,
      'SIGN': signature,
      'Timestamp': timestamp,
      'Content-Type': 'application/json',
    },
    body: body
  })

  return await response.json()
}

// Huobi (HTX) API
async function placeHuobiOrder(apiKey: string, apiSecret: string, symbol: string, side: string, amount: string) {
  const timestamp = new Date().toISOString().slice(0, 19)
  const params = new URLSearchParams({
    AccessKeyId: apiKey,
    SignatureMethod: 'HmacSHA256',
    SignatureVersion: '2',
    Timestamp: timestamp
  })

  const signString = 'POST\napi.huobi.pro\n/v1/order/orders/place\n' + params.toString()
  const signature = createHmac('sha256', apiSecret).update(signString).digest('base64')
  params.append('Signature', signature)

  const body = JSON.stringify({
    'account-id': '123456', // Нужно получить из API
    symbol: (symbol || 'btcusdt').toLowerCase(),
    type: ,
    amount: amount || '0.001'
  })

  const response = await fetch(, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body
  })

  return await response.json()
}

// OKX API
async function placeOKXOrder(apiKey: string, apiSecret: string, symbol: string, side: string, amount: string) {
  const timestamp = new Date().toISOString()
  const method = 'POST'
  const requestPath = '/api/v5/trade/order'
  const body = JSON.stringify({
    instId: symbol || 'BTC-USDT',
    tdMode: 'cash',
    side: side?.toLowerCase() || 'buy',
    ordType: 'market',
    sz: amount || '0.001'
  })

  const signString = timestamp + method + requestPath + body
  const signature = createHmac('sha256', apiSecret).update(signString).digest('base64')

  const response = await fetch('https://www.okx.com/api/v5/trade/order', {
    method: 'POST',
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': Deno.env.get('OKX_PASSPHRASE') || '',
      'Content-Type': 'application/json',
    },
    body: body
  })

  return await response.json()
}

// Bitget API
async function placeBitgetOrder(apiKey: string, apiSecret: string, symbol: string, side: string, amount: string) {
  const timestamp = Date.now().toString()
  const method = 'POST'
  const requestPath = '/api/spot/v1/trade/orders'
  const body = JSON.stringify({
    symbol: symbol || 'BTCUSDT',
    side: side?.toLowerCase() || 'buy',
    orderType: 'market',
    size: amount || '0.001'
  })

  const signString = timestamp + method + requestPath + body
  const signature = createHmac('sha256', apiSecret).update(signString).digest('base64')

  const response = await fetch('https://api.bitget.com/api/spot/v1/trade/orders', {
    method: 'POST',
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': Deno.env.get('BITGET_PASSPHRASE') || '',
      'Content-Type': 'application/json',
    },
    body: body
  })

  return await response.json()
}

// KuCoin API
async function placeKuCoinOrder(apiKey: string, apiSecret: string, symbol: string, side: string, amount: string) {
  const timestamp = Date.now().toString()
  const method = 'POST'
  const endpoint = '/api/v1/orders'
  const body = JSON.stringify({
    clientOid: Date.now().toString(),
    symbol: symbol || 'BTC-USDT',
    side: side?.toLowerCase() || 'buy',
    type: 'market',
    size: amount || '0.001'
  })

  const signString = timestamp + method + endpoint + body
  const signature = createHmac('sha256', apiSecret).update(signString).digest('base64')
  const passphrase = createHmac('sha256', apiSecret).update(Deno.env.get('KUCOIN_PASSPHRASE') || '').digest('base64')

  const response = await fetch('https://api.kucoin.com/api/v1/orders', {
    method: 'POST',
    headers: {
      'KC-API-KEY': apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphrase,
      'KC-API-KEY-VERSION': '2',
      'Content-Type': 'application/json',
    },
    body: body
  })

  return await response.json()
}

// MEXC API
async function placeMEXCOrder(apiKey: string, apiSecret: string, symbol: string, side: string, amount: string) {
  const timestamp = Date.now()
  const params = new URLSearchParams({
    symbol: symbol || 'BTCUSDT',
    side: side || 'BUY',
    type: 'MARKET',
    quantity: amount || '0.001',
    timestamp: timestamp.toString()
  })

  const signature = createHmac('sha256', apiSecret).update(params.toString()).digest('hex')
  params.append('signature', signature)

  const response = await fetch('https://api.mexc.com/api/v3/order', {
    method: 'POST',
    headers: {
      'X-MEXC-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params
  })

  return await response.json()
}
