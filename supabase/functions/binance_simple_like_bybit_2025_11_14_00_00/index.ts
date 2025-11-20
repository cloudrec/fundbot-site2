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

    const { action, exchange, symbol, side, amount, leverage, stopLoss, takeProfit, user_id } = await req.json()
    console.log(`🚀 BINANCE SIMPLE ORDER:`, { action, exchange, symbol, side, amount, leverage, stopLoss, takeProfit, user_id })

    if (!user_id) {
      return new Response(JSON.stringify({ success: false, error: 'user_id обязателен' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: binanceKeys, error: binanceError } = await supabaseClient
      .from('api_keys_2025_11_12_05_30')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'binance')

    if (binanceError || !binanceKeys || binanceKeys.length === 0) {
      return new Response(JSON.stringify({ success: false, error: `Binance ключи не найдены` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKeys = binanceKeys[0]
    console.log(`✅ Using Binance API key: ${apiKeys.api_key}`)

    if (action === 'place_order_with_tp_sl' && exchange.toLowerCase() === 'binance') {
      console.log('🔥 РАЗМЕЩАЕМ ОРДЕР НА BINANCE FUTURES!')
      
      const baseURL = 'https://fapi.binance.com'
      
      // Получаем информацию о символе
      const exchangeInfoResponse = await fetch(`${baseURL}/fapi/v1/exchangeInfo`)
      const exchangeInfo = await exchangeInfoResponse.json()
      
      const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol)
      if (!symbolInfo) {
        throw new Error(`Symbol ${symbol} not found on Binance`)
      }
      
      const quantityPrecision = symbolInfo.quantityPrecision
      const pricePrecision = symbolInfo.pricePrecision
      const minQty = parseFloat(symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE').minQty)
      const stepSize = parseFloat(symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE').stepSize)
      
      console.log(`📊 Symbol info: quantityPrecision=${quantityPrecision}, pricePrecision=${pricePrecision}, minQty=${minQty}`)
      
      // Получаем текущую цену
      const tickerResponse = await fetch(`${baseURL}/fapi/v1/ticker/price?symbol=${symbol}`)
      const ticker = await tickerResponse.json()
      const currentPrice = parseFloat(ticker.price)
      
      console.log(`💰 Current ${symbol} price: ${currentPrice}`)
      
      // Расчет количества с учетом плеча (КАК У BYBIT!)
      const marginAmount = parseFloat(amount)
      const leverageValue = parseFloat(leverage)
      const positionSizeUSD = marginAmount * leverageValue
      
      console.log(`📊 Position: Margin=${marginAmount}, Leverage=${leverageValue}x, Size=${positionSizeUSD}`)
      
      // Проверяем минимальный notional (100 USD для Binance)
      if (positionSizeUSD < 100) {
        return new Response(JSON.stringify({
          success: false,
          error: `Размер позиции ${positionSizeUSD} USD меньше минимального 100 USD для Binance. Увеличьте сумму или плечо.`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      let quantity = positionSizeUSD / currentPrice
      quantity = Math.floor(quantity / stepSize) * stepSize
      if (quantity < minQty) {
        quantity = minQty
      }
      
      const quantityFormatted = quantity.toFixed(quantityPrecision)
      
      console.log(`📊 Calculated quantity: ${quantityFormatted}`)
      
      // Расчет TP и SL в процентах (КАК У BYBIT!)
      let tpPercent = 2.0
      let slPercent = 1.0
      
      if (takeProfit && takeProfit !== '' && takeProfit !== '0') {
        tpPercent = parseFloat(takeProfit)
      }
      if (stopLoss && stopLoss !== '' && stopLoss !== '0') {
        slPercent = parseFloat(stopLoss)
      }
      
      console.log(`🎯 Используемые проценты: TP=${tpPercent}%, SL=${slPercent}%`)
      
      // Расчет цен TP и SL
      const tpPrice = side === 'BUY' 
        ? currentPrice * (1 + tpPercent / 100)
        : currentPrice * (1 - tpPercent / 100)
        
      const slPrice = side === 'BUY'
        ? currentPrice * (1 - slPercent / 100)
        : currentPrice * (1 + slPercent / 100)
      
      const tpPriceFormatted = tpPrice.toFixed(pricePrecision)
      const slPriceFormatted = slPrice.toFixed(pricePrecision)
      
      console.log(`🎯 Рассчитанные цены: Current=${currentPrice}, TP=${tpPriceFormatted}, SL=${slPriceFormatted}`)
      
      // Устанавливаем плечо
      const timestamp = Date.now()
      const leverageParams = `symbol=${symbol}&leverage=${leverageValue}&timestamp=${timestamp}`
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
      const orderTimestamp = Date.now()
      const orderParams = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantityFormatted}&timestamp=${orderTimestamp}`
      const orderSignature = await createBinanceSignature(orderParams, apiKeys.secret)
      
      console.log('📋 Placing main order...')
      
      const orderResponse = await fetch(`${baseURL}/fapi/v1/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKeys.api_key,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `${orderParams}&signature=${orderSignature}`
      })
      
      const orderResult = await orderResponse.json()
      console.log('🎯 Main order result:', orderResult)
      
      if (orderResult.orderId) {
        console.log('✅ Основной ордер размещен! Размещаем TP/SL...')
        
        // Размещаем TP ордер
        const tpTimestamp = Date.now()
        const tpParams = `symbol=${symbol}&side=${side === 'BUY' ? 'SELL' : 'BUY'}&type=TAKE_PROFIT_MARKET&quantity=${quantityFormatted}&stopPrice=${tpPriceFormatted}&timeInForce=GTC&timestamp=${tpTimestamp}`
        const tpSignature = await createBinanceSignature(tpParams, apiKeys.secret)
        
        const tpResponse = await fetch(`${baseURL}/fapi/v1/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKeys.api_key,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `${tpParams}&signature=${tpSignature}`
        })
        
        const tpResult = await tpResponse.json()
        console.log('🎯 TP order result:', tpResult)
        
        // Размещаем SL ордер
        const slTimestamp = Date.now()
        const slParams = `symbol=${symbol}&side=${side === 'BUY' ? 'SELL' : 'BUY'}&type=STOP_MARKET&quantity=${quantityFormatted}&stopPrice=${slPriceFormatted}&timeInForce=GTC&timestamp=${slTimestamp}`
        const slSignature = await createBinanceSignature(slParams, apiKeys.secret)
        
        const slResponse = await fetch(`${baseURL}/fapi/v1/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': apiKeys.api_key,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `${slParams}&signature=${slSignature}`
        })
        
        const slResult = await slResponse.json()
        console.log('🎯 SL order result:', slResult)
        
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
            sl: slPriceFormatted,
            tp: tpPriceFormatted,
            sl_percent: slPercent,
            tp_percent: tpPercent,
            currentPrice: currentPrice,
            expected_tp_pnl: `+${((tpPrice - currentPrice) * quantity * (side === 'BUY' ? 1 : -1)).toFixed(2)} USD`,
            expected_sl_pnl: `${((slPrice - currentPrice) * quantity * (side === 'BUY' ? 1 : -1)).toFixed(2)} USD`,
            status: '🔥 BINANCE FUTURES ORDER WITH TP/SL',
            exchange: 'BINANCE FUTURES',
            timestamp: new Date().toISOString(),
            tp_order: tpResult.orderId ? { orderId: tpResult.orderId } : { error: tpResult },
            sl_order: slResult.orderId ? { orderId: slResult.orderId } : { error: slResult }
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: `Binance Error: ${orderResult.msg || 'Unknown error'}`,
          debug: orderResult
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }
    
    return new Response(JSON.stringify({
      success: false,
      error: `${exchange?.toUpperCase()} не поддерживается`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('❌ Function error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: `Ошибка: ${error.message}` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })
  }
})
