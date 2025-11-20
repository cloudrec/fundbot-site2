import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
}

async function createBybitSignature(timestamp: string, apiKey: string, recvWindow: string, body: string, apiSecret: string): Promise<string> {
  const message = timestamp + apiKey + recvWindow + body
  const encoder = new TextEncoder()
  const keyData = encoder.encode(apiSecret)
  const messageData = encoder.encode(message)
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
    console.log(`🚀 BYBIT ORDER (ПЛЕЧО + ДИНАМИЧЕСКИЕ TP/SL):`, { 
      action, exchange, symbol, side, amount, leverage, stopLoss, takeProfit, user_id 
    })

    if (!user_id) {
      return new Response(JSON.stringify({ success: false, error: 'user_id обязателен' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: bybitKeys, error: bybitError } = await supabaseClient
      .from('api_keys_2025_11_12_05_30')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'bybit')

    if (bybitError || !bybitKeys || bybitKeys.length === 0) {
      return new Response(JSON.stringify({ success: false, error: `Bybit ключи не найдены` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKeys = bybitKeys[0]
    console.log(`✅ Using API key: ${apiKeys.api_key}`)

    if (action === 'place_test_order' && exchange.toLowerCase() === 'bybit') {
      console.log('🔥 РАЗМЕЩАЕМ ОРДЕР С ПЛЕЧОМ И ДИНАМИЧЕСКИМИ TP/SL!')
      
      // 1. Получаем информацию о символе
      const instrumentResponse = await fetch(`https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=${symbol}`)
      const instrumentData = await instrumentResponse.json()
      
      if (instrumentData.retCode !== 0) {
        throw new Error(`Instrument info error: ${instrumentData.retMsg}`)
      }
      
      const instrumentInfo = instrumentData.result.list[0]
      const minOrderQty = parseFloat(instrumentInfo.lotSizeFilter.minOrderQty)
      const qtyStep = parseFloat(instrumentInfo.lotSizeFilter.qtyStep)
      
      console.log(`📊 Instrument info: minOrderQty=${minOrderQty}, qtyStep=${qtyStep}`)
      
      // 2. Получаем цену
      const tickerResponse = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`)
      const tickerData = await tickerResponse.json()
      
      if (tickerData.retCode !== 0) {
        throw new Error(`Ticker error: ${tickerData.retMsg}`)
      }
      
      const currentPrice = parseFloat(tickerData.result.list[0].lastPrice)
      console.log(`💰 Current ${symbol} price: ${currentPrice}`)
      
      // 3. ПРАВИЛЬНЫЙ РАСЧЕТ С УЧЕТОМ ПЛЕЧА
      const marginAmount = parseFloat(amount)  // Маржа (залог)
      const leverageValue = parseFloat(leverage)  // Плечо
      const positionSizeUSD = marginAmount * leverageValue  // Размер позиции в USD
      
      console.log(`📊 Расчет позиции:`)
      console.log(`   Маржа (залог): ${marginAmount} USD`)
      console.log(`   Плечо: ${leverageValue}x`)
      console.log(`   Размер позиции: ${positionSizeUSD} USD`)
      
      // Количество контрактов = Размер позиции в USD / Цена
      let qty = positionSizeUSD / currentPrice
      qty = Math.floor(qty / qtyStep) * qtyStep
      if (qty < minOrderQty) {
        qty = minOrderQty
      }
      const qtyFormatted = qty.toFixed(3)
      
      console.log(`📊 Количество контрактов: ${qtyFormatted}`)
      
      // 4. ДИНАМИЧЕСКИЕ TP/SL ИЗ ПАРАМЕТРОВ ФРОНТЕНДА
      console.log(`🎯 TP/SL параметры из фронтенда:`)
      console.log(`   takeProfit: ${takeProfit}`)
      console.log(`   stopLoss: ${stopLoss}`)
      
      // Используем параметры из фронтенда (НЕ дефолтные значения!)
      const tpPercent = takeProfit ? parseFloat(takeProfit) : 2.0
      const slPercent = stopLoss ? parseFloat(stopLoss) : 1.0
      
      console.log(`🎯 Используемые проценты:`)
      console.log(`   TP: ${tpPercent}%`)
      console.log(`   SL: ${slPercent}%`)
      
      const tpPrice = side === 'Buy' 
        ? currentPrice * (1 + tpPercent / 100)
        : currentPrice * (1 - tpPercent / 100)
        
      const slPrice = side === 'Buy'
        ? currentPrice * (1 - slPercent / 100)
        : currentPrice * (1 + slPercent / 100)

      console.log(`🎯 Рассчитанные цены:`)
      console.log(`   Current: ${currentPrice}`)
      console.log(`   TP: ${tpPrice.toFixed(4)} (${tpPercent}%)`)
      console.log(`   SL: ${slPrice.toFixed(4)} (${slPercent}%)`)

      // 5. Создаем ордер с правильными параметрами
      const orderParams = {
        category: 'linear',
        symbol: symbol,
        side: side,
        orderType: 'Market',
        qty: qtyFormatted,
        timeInForce: 'IOC',
        takeProfit: tpPrice.toFixed(4),
        stopLoss: slPrice.toFixed(4),
        positionIdx: 0
      }

      const orderBody = JSON.stringify(orderParams)
      const timestamp = Date.now().toString()
      const signature = await createBybitSignature(timestamp, apiKeys.api_key, '5000', orderBody, apiKeys.secret)

      console.log('📋 Final order params:', orderParams)

      const orderResponse = await fetch(`https://api.bybit.com/v5/order/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BAPI-API-KEY': apiKeys.api_key,
          'X-BAPI-SIGN': signature,
          'X-BAPI-SIGN-TYPE': '2',
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': '5000'
        },
        body: orderBody
      })

      const orderResult = await orderResponse.json()
      console.log('🎯 Order result:', orderResult)
      
      if (orderResult.retCode === 0) {
        console.log('🎉 УСПЕХ! ОРДЕР С ПЛЕЧОМ И ДИНАМИЧЕСКИМИ TP/SL!')
        return new Response(JSON.stringify({
          success: true,
          message: `🎉 ОРДЕР РАЗМЕЩЕН: ${orderResult.result.orderId}`,
          order: {
            orderId: orderResult.result.orderId,
            orderLinkId: orderResult.result.orderLinkId,
            symbol: symbol,
            side: side,
            margin_amount: marginAmount,
            leverage: leverageValue,
            position_size_usd: positionSizeUSD,
            qty: qtyFormatted,
            sl: slPrice.toFixed(4),
            tp: tpPrice.toFixed(4),
            sl_percent: slPercent,
            tp_percent: tpPercent,
            currentPrice: currentPrice,
            status: '🔥 REAL ORDER WITH LEVERAGE & DYNAMIC TP/SL',
            exchange: 'BYBIT MAINNET',
            timestamp: new Date().toISOString()
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: `Bybit Error: ${orderResult.retMsg} (${orderResult.retCode})`,
          debug: {
            leverage_calculation: {
              margin_amount: marginAmount,
              leverage: leverageValue,
              position_size_usd: positionSizeUSD,
              current_price: currentPrice,
              calculated_qty: positionSizeUSD / currentPrice,
              final_qty: qtyFormatted
            },
            tp_sl_params: {
              frontend_takeProfit: takeProfit,
              frontend_stopLoss: stopLoss,
              used_tp_percent: tpPercent,
              used_sl_percent: slPercent,
              calculated_tp: tpPrice.toFixed(4),
              calculated_sl: slPrice.toFixed(4)
            },
            order_params: orderParams,
            response: orderResult
          }
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
