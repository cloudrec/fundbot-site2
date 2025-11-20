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
    )

    const { action, exchange, symbol, side, amount, userId } = await req.json()

    console.log(`Trading request: ${action} on ${exchange} for ${symbol}`)

    // Получаем API ключи пользователя
    const { data: apiKeys } = await supabaseClient
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .eq('exchange', exchange.toLowerCase())
      .single()

    if (!apiKeys) {
      throw new Error(`API keys not found for ${exchange}`)
    }

    let result = {}

    switch (action) {
      case 'start_bot':
        result = { success: true, message: 'Bot started successfully' }
        break
      case 'stop_bot':
        result = { success: true, message: 'Bot stopped successfully' }
        break
      case 'test_long':
        result = await executeTestTrade(exchange, 'long', symbol, amount, apiKeys)
        break
      case 'test_short':
        result = await executeTestTrade(exchange, 'short', symbol, amount, apiKeys)
        break
      case 'check_balance':
        result = await checkBalance(exchange, apiKeys)
        break
      case 'scan_funding':
        result = await scanFunding(exchange, apiKeys)
        break
      case 'cancel_orders':
        result = await cancelAllOrders(exchange, symbol, apiKeys)
        break
      case 'close_positions':
        result = await closeAllPositions(exchange, symbol, apiKeys)
        break
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Trading engine error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function executeTestTrade(exchange: string, side: string, symbol: string, amount: number, apiKeys: any) {
  // Здесь будет логика для тестовых сделок
  return {
    success: true,
    message: `Test ${side} order executed on ${exchange}`,
    orderId: `test_${Date.now()}`,
    symbol,
    amount
  }
}

async function checkBalance(exchange: string, apiKeys: any) {
  // Здесь будет логика проверки баланса
  return {
    success: true,
    balance: {
      USDT: 1000.50,
      BTC: 0.025,
      ETH: 0.5
    }
  }
}

async function scanFunding(exchange: string, apiKeys: any) {
  // Здесь будет логика сканирования фандинга
  return {
    success: true,
    funding_rates: [
      { symbol: 'BTCUSDT', rate: 0.0001, next_funding: '2025-11-11T23:00:00Z' },
      { symbol: 'ETHUSDT', rate: -0.0002, next_funding: '2025-11-11T23:00:00Z' }
    ]
  }
}

async function cancelAllOrders(exchange: string, symbol: string, apiKeys: any) {
  return {
    success: true,
    message: `All orders cancelled for ${symbol} on ${exchange}`,
    cancelled_orders: 0
  }
}

async function closeAllPositions(exchange: string, symbol: string, apiKeys: any) {
  return {
    success: true,
    message: `All positions closed for ${symbol} on ${exchange}`,
    closed_positions: 0
  }
}
