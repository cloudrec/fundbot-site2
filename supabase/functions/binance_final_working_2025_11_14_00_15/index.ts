import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
}

async function createBinanceSignature(queryString: string, apiSecret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(apiSecret)
  const messageData = encoder.encode(queryString)
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
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

    const requestData = await req.json()
    const { action, exchange, symbol, side, amount, leverage, stopLoss, takeProfit, user_id } = requestData
    
    console.log('🔥 BINANCE FINAL - RECEIVED:', JSON.stringify(requestData, null, 2))

    if (!user_id) {
      return new Response(JSON.stringify({ success: false, error: 'user_id обязателен' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Получаем API ключи
    const { data: binanceKeys, error: binanceError } = await supabaseClient
      .from('api_keys_2025_11_12_05_30')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'binance')

    if (binanceError || !binanceKeys || binanceKeys.length === 0) {
      console.log('❌ Binance keys not found:', binanceError)
      return new Response(JSON.stringify({ success: false, error: 'Binance ключи не найдены' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKeys = binanceKeys[0]
    console.log('✅ Found Binance API key:', apiKeys.api_key)

    if (action === 'place_order_with_tp_sl' && exchange.toLowerCase() === 'binance') {
      console.log('🚀 PLACING BINANCE FUTURES ORDER')
      
      const baseURL = 'https://fapi.binance.com'
      
      // ПРЯМОЙ РАСЧЕТ КАК У BYBIT
      const marginAmount = parseFloat(amount || '10')
      const leverageValue = parseFloat(leverage || '10')
      const positionSizeUSD = marginAmount * leverageValue
      
      console.log(`💰 CALCULATION: ${marginAmount} * ${leverageValue} = ${positionSizeUSD} USD`)
      
      // Проверяем минимум Binance
      if (positionSizeUSD < 100) {
        return new Response(JSON.stringify({
          success: false,
          error: `Размер позиции ${positionSizeUSD} USD < 100 USD (минимум Binance). Увеличьте сумму или плечо.`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      // Получаем информацию о символе
      console.log(`📊 Getting symbol info for ${symbol}`)
      const exchangeInfoResponse = await fetch(`${baseURL}/fapi/v1/exchangeInfo`)
      const exchangeInfo = await exchangeInfoResponse.json()
      
      const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol)
      if (!symbolInfo) {
        return new Response(JSON.stringify({
          success: false,
          error: `Symbol ${symbol} not found on Binance`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      const quantityPrecision = symbolInfo.quantityPrecision
      const pricePrecision = symbolInfo.pricePrecision
      const minQty = parseFloat(symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE').minQty)
      const stepSize = parseFloat(symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE').stepSize)
      
      console.log(`📊 Symbol info: precision=${quantityPrecision}, minQty=${minQty}, stepSize=${stepSize}`)
      
      // Получаем текущую цену
      const tickerResponse = await fetch(`${baseURL}/fapi/v1/ticker/price?symbol=${symbol}`)
      const ticker = await tickerResponse.json()
      const currentPrice = parseFloat(ticker.price)
      
      console.log(`💰 Current ${symbol} price: ${currentPrice}`)
      
      // Рассчитываем количество
      let quantity = positionSizeUSD / currentPrice
      quantity = Math.floor(quantity / stepSize) * stepSize
      if (quantity < minQty) {
        quantity = minQty
      }
      
      const quantityFormatted = quantity.toFixed(quantityPrecision)
      const notionalValue = quantity * currentPrice
      
      console.log(`📊 Quantity: ${quantityFormatted}, Notional: ${notionalValue}`)
      
      // Проверяем что notional >= 100
      if (notionalValue < 100) {
        return new Response(JSON.stringify({
          success: false,
          error: `Calculated notional ${notionalValue.toFixed(2)} < 100. Increase amount or leverage.`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      // Устанавливаем плечо
      console.log(`🔧 Setting leverage to ${leverageValue}x`)
      const timestamp1 = Date.now()
      const leverageParams = `symbol=${symbol}&leverage=${leverageValue}&timestamp=${timestamp1}`
      const leverageSignature = await createBinanceSignature(leverageParams, apiKeys.secret)
      
      const leverageResponse = await fetch(`${baseURL}/fapi/v1/leverage`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKeys.api_key,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `${leverageParams}&signature=${leverageSignature}`
      })
      
      const leverageResult = await leverageResponse.json()
      console.log('🔧 Leverage result:', leverageResult)
      
      // Размещаем основной ордер
      console.log('📋 Placing main market order...')
      const timestamp2 = Date.now()
      const orderParams = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantityFormatted}&timestamp=${timestamp2}`
      const orderSignature = await createBinanceSignature(orderParams, apiKeys.secret)
      
      const orderResponse = await fetch(`${baseURL}/fapi/v1/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKeys.api_key,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `${orderParams}&signature=${orderSignature}`
      })
      
      const orderResult = await orderResponse.json()
      console.log('🎯 Order result:', orderResult)
      
      if (orderResult.orderId) {
        return new Response(JSON.stringify({
          success: true,
          message: `🎉 BINANCE ОРДЕР РАЗМЕЩЕН: ${orderResult.orderId}`,
          order: {
            orderId: orderResult.orderId,
            symbol: symbol,
            side: side,
            margin_amount: marginAmount,
            leverage: leverageValue,
            position_size_usd: positionSizeUSD,
            qty: quantityFormatted,
            currentPrice: currentPrice,
            notional: notionalValue,
            status: '🔥 BINANCE FUTURES ORDER',
            exchange: 'BINANCE FUTURES',
            timestamp: new Date().toISOString()
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: `Binance API Error: ${orderResult.msg || JSON.stringify(orderResult)}`,
          debug: {
            orderResult,
            leverageResult,
            calculatedParams: {
              marginAmount,
              leverageValue,
              positionSizeUSD,
              quantityFormatted,
              notionalValue,
              currentPrice
            }
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }
    
    return new Response(JSON.stringify({
      success: false,
      error: `Action '${action}' not supported for ${exchange}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('❌ Function error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: `Error: ${error.message}`,
      stack: error.stack
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })
  }
})
