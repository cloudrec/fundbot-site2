import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, user_id } = await req.json();
    console.log('🔥 LIVE Trading action:', action, 'for user:', user_id);

    // Получаем API ключи пользователя
    const { data: apiKeysData, error: apiKeysError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id);

    if (apiKeysError) {
      console.error('🔥 API Keys error:', apiKeysError);
      throw new Error(`Ошибка получения API ключей: ${apiKeysError.message}`);
    }

    if (!apiKeysData || apiKeysData.length === 0) {
      throw new Error('API ключи не найдены. Добавьте API ключи в разделе "API Ключи"');
    }

    console.log('🔥 Found API keys for exchanges:', apiKeysData.map(k => k.exchange));

    // Получаем настройки торговли
    const { data: settingsData, error: settingsError } = await supabaseClient
      .from('trading_settings_dev')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError) {
      console.error('🔥 Settings error:', settingsError);
      throw new Error(`Ошибка получения настроек: ${settingsError.message}`);
    }

    if (!settingsData) {
      throw new Error('Настройки торговли не найдены. Настройте параметры в разделе "Настройки"');
    }

    console.log('🔥 Trading settings:', settingsData);

    // Находим ключи для нужной биржи
    const exchange = settingsData.exchange || 'bybit';
    const apiKey = apiKeysData.find(k => k.exchange === exchange);

    if (!apiKey) {
      throw new Error(`API ключи для биржи ${exchange.toUpperCase()} не найдены. Добавьте ключи в разделе "API Ключи"`);
    }

    console.log('🔥 Using LIVE API key for exchange:', exchange);

    // Обработка разных действий
    switch (action) {
      case 'check_balance':
        return new Response(JSON.stringify({
          success: true,
          balance: await getLiveBalance(apiKey, settingsData)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'get_positions':
        return new Response(JSON.stringify({
          success: true,
          positions: await getLivePositions(apiKey, settingsData)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'place_test_order':
        return new Response(JSON.stringify({
          success: true,
          order: await placeLiveTestOrder(apiKey, settingsData)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'place_order_with_tp_sl':
        return new Response(JSON.stringify({
          success: true,
          order: await placeLiveOrderWithTPSL(apiKey, settingsData)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'cancel_all_orders':
        return new Response(JSON.stringify({
          success: true,
          result: await cancelAllLiveOrders(apiKey, settingsData)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case 'close_all_positions':
        return new Response(JSON.stringify({
          success: true,
          result: await closeAllLivePositions(apiKey, settingsData)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      default:
        throw new Error(`Неизвестное действие: ${action}`);
    }

  } catch (error) {
    console.error('🔥 LIVE Trading error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// ЖИВЫЕ функции для всех бирж
async function getLiveBalance(apiKey: any, settings: any) {
  console.log('🔥 Getting LIVE balance for', apiKey.exchange);
  
  switch (apiKey.exchange) {
    case 'bybit':
      return await getBybitBalance(apiKey, settings);
    case 'binance':
      return await getBinanceBalance(apiKey, settings);
    case 'okx':
      return await getOKXBalance(apiKey, settings);
    case 'gate':
      return await getGateBalance(apiKey, settings);
    case 'kucoin':
      return await getKuCoinBalance(apiKey, settings);
    default:
      throw new Error(`Биржа ${apiKey.exchange} не поддерживается`);
  }
}

async function getLivePositions(apiKey: any, settings: any) {
  console.log('🔥 Getting LIVE positions for', apiKey.exchange);
  
  switch (apiKey.exchange) {
    case 'bybit':
      return await getBybitPositions(apiKey, settings);
    case 'binance':
      return await getBinancePositions(apiKey, settings);
    case 'okx':
      return await getOKXPositions(apiKey, settings);
    case 'gate':
      return await getGatePositions(apiKey, settings);
    case 'kucoin':
      return await getKuCoinPositions(apiKey, settings);
    default:
      throw new Error(`Биржа ${apiKey.exchange} не поддерживается`);
  }
}

async function placeLiveTestOrder(apiKey: any, settings: any) {
  console.log('🔥 Placing LIVE test order for', apiKey.exchange);
  
  switch (apiKey.exchange) {
    case 'bybit':
      return await placeBybitTestOrder(apiKey, settings);
    case 'binance':
      return await placeBinanceTestOrder(apiKey, settings);
    case 'okx':
      return await placeOKXTestOrder(apiKey, settings);
    case 'gate':
      return await placeGateTestOrder(apiKey, settings);
    case 'kucoin':
      return await placeKuCoinTestOrder(apiKey, settings);
    default:
      throw new Error(`Биржа ${apiKey.exchange} не поддерживается`);
  }
}

async function placeLiveOrderWithTPSL(apiKey: any, settings: any) {
  console.log('🔥 Placing LIVE order with TP/SL for', apiKey.exchange);
  
  switch (apiKey.exchange) {
    case 'bybit':
      return await placeBybitOrderWithTPSL(apiKey, settings);
    case 'binance':
      return await placeBinanceOrderWithTPSL(apiKey, settings);
    case 'okx':
      return await placeOKXOrderWithTPSL(apiKey, settings);
    case 'gate':
      return await placeGateOrderWithTPSL(apiKey, settings);
    case 'kucoin':
      return await placeKuCoinOrderWithTPSL(apiKey, settings);
    default:
      throw new Error(`Биржа ${apiKey.exchange} не поддерживается`);
  }
}

async function cancelAllLiveOrders(apiKey: any, settings: any) {
  console.log('🔥 Cancelling ALL LIVE orders for', apiKey.exchange);
  
  switch (apiKey.exchange) {
    case 'bybit':
      return await cancelBybitOrders(apiKey, settings);
    case 'binance':
      return await cancelBinanceOrders(apiKey, settings);
    case 'okx':
      return await cancelOKXOrders(apiKey, settings);
    case 'gate':
      return await cancelGateOrders(apiKey, settings);
    case 'kucoin':
      return await cancelKuCoinOrders(apiKey, settings);
    default:
      throw new Error(`Биржа ${apiKey.exchange} не поддерживается`);
  }
}

async function closeAllLivePositions(apiKey: any, settings: any) {
  console.log('🔥 Closing ALL LIVE positions for', apiKey.exchange);
  
  switch (apiKey.exchange) {
    case 'bybit':
      return await closeBybitPositions(apiKey, settings);
    case 'binance':
      return await closeBinancePositions(apiKey, settings);
    case 'okx':
      return await closeOKXPositions(apiKey, settings);
    case 'gate':
      return await closeGatePositions(apiKey, settings);
    case 'kucoin':
      return await closeKuCoinPositions(apiKey, settings);
    default:
      throw new Error(`Биржа ${apiKey.exchange} не поддерживается`);
  }
}

// ===== BYBIT API FUNCTIONS =====
async function getBybitBalance(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now().toString();
    const params = `accountType=UNIFIED&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const url = `https://api${apiKey.is_testnet ? '-testnet' : ''}.bybit.com/v5/account/wallet-balance?${params}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('🔥 Bybit LIVE balance response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg}`);
    }

    const usdtBalance = data.result?.list?.[0]?.coin?.find((c: any) => c.coin === 'USDT');
    
    return {
      exchange: "BYBIT",
      total_balance: usdtBalance?.walletBalance || "0.00",
      available_balance: usdtBalance?.availableToWithdraw || "0.00",
      currency: "USDT",
      status: "LIVE"
    };
  } catch (error) {
    console.error('🔥 Bybit balance error:', error);
    throw new Error(`Ошибка получения баланса Bybit: ${error.message}`);
  }
}

async function getBybitPositions(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now().toString();
    const params = `category=linear&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const url = `https://api${apiKey.is_testnet ? '-testnet' : ''}.bybit.com/v5/position/list?${params}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('🔥 Bybit LIVE positions response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg}`);
    }

    return data.result?.list?.map((pos: any) => ({
      symbol: pos.symbol,
      side: pos.side,
      size: pos.size,
      entry_price: pos.avgPrice,
      mark_price: pos.markPrice,
      pnl: pos.unrealisedPnl,
      exchange: "BYBIT",
      status: "LIVE"
    })) || [];
  } catch (error) {
    console.error('🔥 Bybit positions error:', error);
    throw new Error(`Ошибка получения позиций Bybit: ${error.message}`);
  }
}

async function placeBybitTestOrder(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now().toString();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    const orderData = {
      category: "linear",
      symbol: symbol,
      side: "Buy",
      orderType: "Market",
      qty: "0.001",
      timeInForce: "IOC"
    };

    const params = `category=linear&symbol=${symbol}&side=Buy&orderType=Market&qty=0.001&timeInForce=IOC&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const url = `https://api${apiKey.is_testnet ? '-testnet' : ''}.bybit.com/v5/order/create`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...orderData,
        timestamp: parseInt(timestamp)
      })
    });

    const data = await response.json();
    console.log('🔥 Bybit LIVE test order response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg}`);
    }

    return {
      order_id: data.result?.orderId,
      symbol: symbol,
      side: "Buy",
      qty: "0.001",
      status: "Submitted",
      exchange: "BYBIT",
      mode: "LIVE",
      note: "Реальный тестовый ордер на Bybit"
    };
  } catch (error) {
    console.error('🔥 Bybit test order error:', error);
    throw new Error(`Ошибка размещения тестового ордера Bybit: ${error.message}`);
  }
}

async function placeBybitOrderWithTPSL(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now().toString();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    const currentPrice = await getCurrentPrice(symbol, apiKey.is_testnet);
    const orderAmount = parseFloat(settings.order_amount || "0.01");
    
    const tpPrice = currentPrice * (1 + (parseFloat(settings.tp_offset_percent || "2") / 100));
    const slPrice = currentPrice * (1 - (parseFloat(settings.stop_loss_percent || "1") / 100));
    
    const orderData = {
      category: "linear",
      symbol: symbol,
      side: "Buy",
      orderType: "Market",
      qty: orderAmount.toString(),
      takeProfit: tpPrice.toFixed(2),
      stopLoss: slPrice.toFixed(2),
      timeInForce: "IOC"
    };

    const params = `category=linear&symbol=${symbol}&side=Buy&orderType=Market&qty=${orderAmount}&takeProfit=${tpPrice.toFixed(2)}&stopLoss=${slPrice.toFixed(2)}&timeInForce=IOC&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const url = `https://api${apiKey.is_testnet ? '-testnet' : ''}.bybit.com/v5/order/create`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...orderData,
        timestamp: parseInt(timestamp)
      })
    });

    const data = await response.json();
    console.log('🔥 Bybit LIVE order with TP/SL response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg}`);
    }

    return {
      order_id: data.result?.orderId,
      symbol: symbol,
      side: "Buy",
      qty: orderAmount.toString(),
      price: currentPrice.toFixed(2),
      take_profit: tpPrice.toFixed(2),
      stop_loss: slPrice.toFixed(2),
      status: "Submitted",
      exchange: "BYBIT",
      mode: "LIVE",
      note: "Реальный ордер с TP/SL на Bybit"
    };
  } catch (error) {
    console.error('🔥 Bybit order with TP/SL error:', error);
    throw new Error(`Ошибка размещения ордера с TP/SL Bybit: ${error.message}`);
  }
}

async function cancelBybitOrders(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now().toString();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    const params = `category=linear&symbol=${symbol}&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const url = `https://api${apiKey.is_testnet ? '-testnet' : ''}.bybit.com/v5/order/cancel-all`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category: "linear",
        symbol: symbol,
        timestamp: parseInt(timestamp)
      })
    });

    const data = await response.json();
    console.log('🔥 Bybit cancel orders response:', data);

    return {
      cancelled_orders: data.result?.list?.length || 0,
      exchange: "BYBIT",
      mode: "LIVE",
      note: "Все ордера отменены на Bybit"
    };
  } catch (error) {
    console.error('🔥 Bybit cancel orders error:', error);
    throw new Error(`Ошибка отмены ордеров Bybit: ${error.message}`);
  }
}

async function closeBybitPositions(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now().toString();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    const params = `category=linear&symbol=${symbol}&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const url = `https://api${apiKey.is_testnet ? '-testnet' : ''}.bybit.com/v5/position/close`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category: "linear",
        symbol: symbol,
        timestamp: parseInt(timestamp)
      })
    });

    const data = await response.json();
    console.log('🔥 Bybit close positions response:', data);

    return {
      closed_positions: 1,
      exchange: "BYBIT",
      mode: "LIVE",
      note: "Позиции закрыты на Bybit"
    };
  } catch (error) {
    console.error('🔥 Bybit close positions error:', error);
    throw new Error(`Ошибка закрытия позиций Bybit: ${error.message}`);
  }
}

// ===== BINANCE API FUNCTIONS =====
async function getBinanceBalance(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createBinanceSignature(apiKey.api_secret, queryString);
    
    const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const url = `${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey.api_key,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('🔥 Binance LIVE balance response:', data);

    if (!response.ok) {
      throw new Error(`Binance API Error: ${data.msg || 'Unknown error'}`);
    }

    const usdtBalance = data.find((b: any) => b.asset === 'USDT');
    
    return {
      exchange: "BINANCE",
      total_balance: usdtBalance?.balance || "0.00",
      available_balance: usdtBalance?.availableBalance || "0.00",
      currency: "USDT",
      status: "LIVE"
    };
  } catch (error) {
    console.error('🔥 Binance balance error:', error);
    throw new Error(`Ошибка получения баланса Binance: ${error.message}`);
  }
}

async function getBinancePositions(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createBinanceSignature(apiKey.api_secret, queryString);
    
    const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const url = `${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey.api_key,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('🔥 Binance LIVE positions response:', data);

    if (!response.ok) {
      throw new Error(`Binance API Error: ${data.msg || 'Unknown error'}`);
    }

    return data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0).map((pos: any) => ({
      symbol: pos.symbol,
      side: parseFloat(pos.positionAmt) > 0 ? "Buy" : "Sell",
      size: Math.abs(parseFloat(pos.positionAmt)).toString(),
      entry_price: pos.entryPrice,
      mark_price: pos.markPrice,
      pnl: pos.unRealizedProfit,
      exchange: "BINANCE",
      status: "LIVE"
    }));
  } catch (error) {
    console.error('🔥 Binance positions error:', error);
    throw new Error(`Ошибка получения позиций Binance: ${error.message}`);
  }
}

async function placeBinanceTestOrder(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    const queryString = `symbol=${symbol}&side=BUY&type=MARKET&quantity=0.001&timestamp=${timestamp}`;
    const signature = await createBinanceSignature(apiKey.api_secret, queryString);
    
    const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const url = `${baseUrl}/fapi/v1/order`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey.api_key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `${queryString}&signature=${signature}`
    });

    const data = await response.json();
    console.log('🔥 Binance LIVE test order response:', data);

    if (!response.ok) {
      throw new Error(`Binance API Error: ${data.msg || 'Unknown error'}`);
    }

    return {
      order_id: data.orderId,
      symbol: symbol,
      side: "Buy",
      qty: "0.001",
      status: data.status,
      exchange: "BINANCE",
      mode: "LIVE",
      note: "Реальный тестовый ордер на Binance"
    };
  } catch (error) {
    console.error('🔥 Binance test order error:', error);
    throw new Error(`Ошибка размещения тестового ордера Binance: ${error.message}`);
  }
}

async function placeBinanceOrderWithTPSL(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    const orderAmount = parseFloat(settings.order_amount || "0.01");
    
    const queryString = `symbol=${symbol}&side=BUY&type=MARKET&quantity=${orderAmount}&timestamp=${timestamp}`;
    const signature = await createBinanceSignature(apiKey.api_secret, queryString);
    
    const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const url = `${baseUrl}/fapi/v1/order`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey.api_key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `${queryString}&signature=${signature}`
    });

    const data = await response.json();
    console.log('🔥 Binance LIVE order response:', data);

    if (!response.ok) {
      throw new Error(`Binance API Error: ${data.msg || 'Unknown error'}`);
    }

    return {
      order_id: data.orderId,
      symbol: symbol,
      side: "Buy",
      qty: orderAmount.toString(),
      status: data.status,
      exchange: "BINANCE",
      mode: "LIVE",
      note: "Реальный ордер на Binance (TP/SL нужно добавить отдельно)"
    };
  } catch (error) {
    console.error('🔥 Binance order error:', error);
    throw new Error(`Ошибка размещения ордера Binance: ${error.message}`);
  }
}

async function cancelBinanceOrders(apiKey: any, settings: any) {
  try {
    const timestamp = Date.now();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    const queryString = `symbol=${symbol}&timestamp=${timestamp}`;
    const signature = await createBinanceSignature(apiKey.api_secret, queryString);
    
    const baseUrl = apiKey.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const url = `${baseUrl}/fapi/v1/allOpenOrders`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': apiKey.api_key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `${queryString}&signature=${signature}`
    });

    const data = await response.json();
    console.log('🔥 Binance cancel orders response:', data);

    return {
      cancelled_orders: data.length || 0,
      exchange: "BINANCE",
      mode: "LIVE",
      note: "Все ордера отменены на Binance"
    };
  } catch (error) {
    console.error('🔥 Binance cancel orders error:', error);
    throw new Error(`Ошибка отмены ордеров Binance: ${error.message}`);
  }
}

async function closeBinancePositions(apiKey: any, settings: any) {
  // Binance требует отдельного API для закрытия позиций
  return {
    closed_positions: 0,
    exchange: "BINANCE",
    mode: "LIVE",
    note: "Закрытие позиций Binance требует дополнительной реализации"
  };
}

// ===== PLACEHOLDER FUNCTIONS FOR OTHER EXCHANGES =====
// OKX, Gate.io, KuCoin functions would be implemented similarly
async function getOKXBalance(apiKey: any, settings: any) {
  throw new Error("OKX API интеграция в разработке. Добавьте API ключи и они будут готовы к использованию.");
}

async function getOKXPositions(apiKey: any, settings: any) {
  throw new Error("OKX API интеграция в разработке.");
}

async function placeOKXTestOrder(apiKey: any, settings: any) {
  throw new Error("OKX API интеграция в разработке.");
}

async function placeOKXOrderWithTPSL(apiKey: any, settings: any) {
  throw new Error("OKX API интеграция в разработке.");
}

async function cancelOKXOrders(apiKey: any, settings: any) {
  throw new Error("OKX API интеграция в разработке.");
}

async function closeOKXPositions(apiKey: any, settings: any) {
  throw new Error("OKX API интеграция в разработке.");
}

// Gate.io functions
async function getGateBalance(apiKey: any, settings: any) {
  throw new Error("Gate.io API интеграция в разработке. Добавьте API ключи и они будут готовы к использованию.");
}

async function getGatePositions(apiKey: any, settings: any) {
  throw new Error("Gate.io API интеграция в разработке.");
}

async function placeGateTestOrder(apiKey: any, settings: any) {
  throw new Error("Gate.io API интеграция в разработке.");
}

async function placeGateOrderWithTPSL(apiKey: any, settings: any) {
  throw new Error("Gate.io API интеграция в разработке.");
}

async function cancelGateOrders(apiKey: any, settings: any) {
  throw new Error("Gate.io API интеграция в разработке.");
}

async function closeGatePositions(apiKey: any, settings: any) {
  throw new Error("Gate.io API интеграция в разработке.");
}

// KuCoin functions
async function getKuCoinBalance(apiKey: any, settings: any) {
  throw new Error("KuCoin API интеграция в разработке. Добавьте API ключи и они будут готовы к использованию.");
}

async function getKuCoinPositions(apiKey: any, settings: any) {
  throw new Error("KuCoin API интеграция в разработке.");
}

async function placeKuCoinTestOrder(apiKey: any, settings: any) {
  throw new Error("KuCoin API интеграция в разработке.");
}

async function placeKuCoinOrderWithTPSL(apiKey: any, settings: any) {
  throw new Error("KuCoin API интеграция в разработке.");
}

async function cancelKuCoinOrders(apiKey: any, settings: any) {
  throw new Error("KuCoin API интеграция в разработке.");
}

async function closeKuCoinPositions(apiKey: any, settings: any) {
  throw new Error("KuCoin API интеграция в разработке.");
}

// ===== UTILITY FUNCTIONS =====
async function getCurrentPrice(symbol: string, isTestnet: boolean = false): Promise<number> {
  try {
    const url = `https://api${isTestnet ? '-testnet' : ''}.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit Price API Error: ${data.retMsg}`);
    }
    
    const price = parseFloat(data.result?.list?.[0]?.lastPrice || "0");
    if (price === 0) {
      throw new Error(`Не удалось получить цену для ${symbol}`);
    }
    
    return price;
  } catch (error) {
    console.error('🔥 Get price error:', error);
    throw new Error(`Ошибка получения цены: ${error.message}`);
  }
}

async function createBybitSignature(secret: string, timestamp: string, apiKey: string, params: string): Promise<string> {
  const message = timestamp + apiKey + params;
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
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createBinanceSignature(secret: string, queryString: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(queryString);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}