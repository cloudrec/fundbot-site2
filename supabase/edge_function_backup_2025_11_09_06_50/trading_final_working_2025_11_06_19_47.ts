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

    const requestBody = await req.json();
    const { action, user_id } = requestBody;
    
    console.log('🔥 Trading request:', { action, user_id });

    if (!action || !user_id) {
      throw new Error('Отсутствуют обязательные параметры: action, user_id');
    }

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
      throw new Error('❌ API ключи не найдены. Добавьте API ключи в разделе "API Ключи"');
    }

    console.log('🔥 Found API keys:', apiKeysData.length);

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
      throw new Error('❌ Настройки торговли не найдены. Настройте параметры в разделе "Настройки"');
    }

    console.log('🔥 Settings loaded:', settingsData.exchange, settingsData.base_asset, settingsData.quote_asset);

    // Находим ключи для нужной биржи
    const exchange = settingsData.exchange || 'bybit';
    const apiKey = apiKeysData.find(k => k.exchange === exchange);

    if (!apiKey) {
      throw new Error(`❌ API ключи для биржи ${exchange.toUpperCase()} не найдены. Добавьте ключи в разделе "API Ключи"`);
    }

    console.log('🔥 Using API key for:', exchange, 'Testnet:', apiKey.is_testnet);

    // Обработка действий
    let result;
    
    switch (action) {
      case 'check_balance':
      case 'get_balance':
        result = await getBalance(apiKey, settingsData);
        break;

      case 'get_positions':
        result = await getPositions(apiKey, settingsData);
        break;

      case 'place_test_order':
        result = await placeTestOrder(apiKey, settingsData);
        break;

      case 'place_order_with_tp_sl':
        result = await placeOrderWithTPSL(apiKey, settingsData);
        break;

      case 'cancel_all_orders':
        result = await cancelAllOrders(apiKey, settingsData);
        break;

      case 'close_all_positions':
        result = await closeAllPositions(apiKey, settingsData);
        break;

      default:
        throw new Error(`❌ Неизвестное действие: ${action}`);
    }

    console.log('🔥 Action result:', result);

    return new Response(JSON.stringify({
      success: true,
      data: result,
      exchange: exchange.toUpperCase(),
      mode: apiKey.is_testnet ? "TESTNET" : "LIVE",
      action: action
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('🔥 Trading error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      mode: "ERROR"
    }), {
      status: 200, // Возвращаем 200 чтобы фронтенд получил ошибку
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Функции для работы с Bybit API
async function getBalance(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Получение баланса для ${apiKey.exchange} пока не поддерживается`);
    }

    const timestamp = Date.now().toString();
    const params = `accountType=UNIFIED&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/account/wallet-balance?${params}`;
    
    console.log('🔥 Balance request URL:', url);
    
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
    console.log('🔥 Bybit balance response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }

    const usdtBalance = data.result?.list?.[0]?.coin?.find((c: any) => c.coin === 'USDT');
    
    return {
      exchange: "BYBIT",
      total_balance: usdtBalance?.walletBalance || "0.00",
      available_balance: usdtBalance?.availableToWithdraw || "0.00",
      currency: "USDT",
      status: apiKey.is_testnet ? "TESTNET ⚠️" : "LIVE ✅"
    };
  } catch (error) {
    console.error('🔥 Balance error:', error);
    throw new Error(`Ошибка получения баланса: ${error.message}`);
  }
}

async function getPositions(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Получение позиций для ${apiKey.exchange} пока не поддерживается`);
    }

    const timestamp = Date.now().toString();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    // Добавляем symbol в параметры для избежания ошибки
    const params = `category=linear&symbol=${symbol}&timestamp=${timestamp}`;
    const signature = await createBybitSignature(apiKey.api_secret, timestamp, apiKey.api_key, params);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/position/list?${params}`;
    
    console.log('🔥 Positions request URL:', url);
    
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
    console.log('🔥 Bybit positions response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }

    const positions = data.result?.list?.filter((pos: any) => parseFloat(pos.size) > 0).map((pos: any) => ({
      symbol: pos.symbol,
      side: pos.side,
      size: pos.size,
      entry_price: pos.avgPrice,
      mark_price: pos.markPrice,
      pnl: pos.unrealisedPnl,
      exchange: "BYBIT",
      status: apiKey.is_testnet ? "TESTNET ⚠️" : "LIVE ✅"
    })) || [];

    console.log('🔥 Filtered positions:', positions.length);
    return positions;
  } catch (error) {
    console.error('🔥 Positions error:', error);
    throw new Error(`Ошибка получения позиций: ${error.message}`);
  }
}

async function placeTestOrder(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Размещение ордеров для ${apiKey.exchange} пока не поддерживается`);
    }

    const timestamp = Date.now();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    // Получаем информацию о символе для правильного размера
    const [symbolInfo, currentPrice] = await Promise.all([
      getSymbolInfo(symbol, apiKey.is_testnet),
      getCurrentPrice(symbol, apiKey.is_testnet)
    ]);
    
    console.log('🔥 Symbol info:', symbolInfo);
    console.log('🔥 Current price:', currentPrice);
    
    // Минимальная стоимость ордера $5 USD
    const minOrderValueUSD = 5;
    const orderAmountUSD = Math.max(minOrderValueUSD, parseFloat(settings.order_amount_usd || "5"));
    
    // Рассчитываем размер ордера с учетом минимальных требований
    const minQty = parseFloat(symbolInfo.lotSizeFilter?.minOrderQty || "0.001");
    const qtyStep = parseFloat(symbolInfo.lotSizeFilter?.qtyStep || "0.001");
    
    let orderAmount = orderAmountUSD / currentPrice;
    orderAmount = Math.max(orderAmount, minQty);
    orderAmount = Math.ceil(orderAmount / qtyStep) * qtyStep;
    
    console.log('🔥 Calculated test order:', {
      orderAmountUSD,
      currentPrice,
      orderAmount,
      minQty,
      qtyStep
    });
    
    const orderData = {
      category: "linear",
      symbol: symbol,
      side: "Buy",
      orderType: "Market",
      qty: orderAmount.toString(),
      timeInForce: "IOC"
    };

    console.log('🔥 Test order data:', orderData);

    const bodyStr = JSON.stringify(orderData);
    const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, bodyStr);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/order/create`;
    
    console.log('🔥 Test order request URL:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'Content-Type': 'application/json'
      },
      body: bodyStr
    });

    const data = await response.json();
    console.log('🔥 Bybit test order response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }

    return {
      order_id: data.result?.orderId,
      symbol: symbol,
      side: "Buy",
      qty: orderAmount.toString(),
      value_usd: orderAmountUSD.toFixed(2),
      status: "Submitted ✅",
      exchange: "BYBIT",
      mode: apiKey.is_testnet ? "TESTNET" : "LIVE",
      note: `🔥 ${apiKey.is_testnet ? 'Тестовый' : 'Реальный'} ордер $${orderAmountUSD} размещен на Bybit`
    };
  } catch (error) {
    console.error('🔥 Test order error:', error);
    throw new Error(`Ошибка размещения тестового ордера: ${error.message}`);
  }
}

async function placeOrderWithTPSL(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Размещение ордеров для ${apiKey.exchange} пока не поддерживается`);
    }

    const timestamp = Date.now();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    // Получаем информацию о символе и текущую цену
    const [symbolInfo, currentPrice] = await Promise.all([
      getSymbolInfo(symbol, apiKey.is_testnet),
      getCurrentPrice(symbol, apiKey.is_testnet)
    ]);
    
    console.log('🔥 Symbol info:', symbolInfo);
    console.log('🔥 Current price:', currentPrice);
    
    // Минимальная стоимость ордера $5 USD
    const minOrderValueUSD = 5;
    const orderAmountUSD = Math.max(minOrderValueUSD, parseFloat(settings.order_amount_usd || "10"));
    
    // Рассчитываем размер ордера с учетом минимальных требований
    const minQty = parseFloat(symbolInfo.lotSizeFilter?.minOrderQty || "0.001");
    const qtyStep = parseFloat(symbolInfo.lotSizeFilter?.qtyStep || "0.001");
    
    let orderAmount = orderAmountUSD / currentPrice;
    orderAmount = Math.max(orderAmount, minQty);
    orderAmount = Math.ceil(orderAmount / qtyStep) * qtyStep;
    
    // Рассчитываем TP и SL правильно (для Buy ордера)
    const tpPercent = parseFloat(settings.tp_offset_percent || "2");
    const slPercent = parseFloat(settings.stop_loss_percent || "1");
    
    // Для Buy ордера: TP выше текущей цены, SL ниже текущей цены
    const tpPrice = (currentPrice * (1 + (tpPercent / 100))).toFixed(2);
    const slPrice = (currentPrice * (1 - (slPercent / 100))).toFixed(2);
    
    console.log('🔥 Calculated order with TP/SL:', {
      orderAmountUSD,
      currentPrice,
      orderAmount,
      tpPrice,
      slPrice,
      tpPercent,
      slPercent
    });
    
    const orderData = {
      category: "linear",
      symbol: symbol,
      side: "Buy",
      orderType: "Market",
      qty: orderAmount.toFixed(6),
      takeProfit: tpPrice,
      stopLoss: slPrice,
      timeInForce: "IOC"
    };

    console.log('🔥 Order with TP/SL data:', orderData);

    const bodyStr = JSON.stringify(orderData);
    const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, bodyStr);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/order/create`;
    
    console.log('🔥 Order with TP/SL request URL:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'Content-Type': 'application/json'
      },
      body: bodyStr
    });

    const data = await response.json();
    console.log('🔥 Bybit order with TP/SL response:', data);

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }

    return {
      order_id: data.result?.orderId,
      symbol: symbol,
      side: "Buy",
      qty: orderAmount.toFixed(6),
      price: currentPrice.toFixed(2),
      value_usd: orderAmountUSD.toFixed(2),
      take_profit: tpPrice,
      stop_loss: slPrice,
      status: "Submitted ✅",
      exchange: "BYBIT",
      mode: apiKey.is_testnet ? "TESTNET" : "LIVE",
      note: `🔥 ${apiKey.is_testnet ? 'Тестовый' : 'Реальный'} ордер $${orderAmountUSD} с TP/SL размещен на Bybit`
    };
  } catch (error) {
    console.error('🔥 Order with TP/SL error:', error);
    throw new Error(`Ошибка размещения ордера с TP/SL: ${error.message}`);
  }
}

async function cancelAllOrders(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Отмена ордеров для ${apiKey.exchange} пока не поддерживается`);
    }

    const timestamp = Date.now();
    const symbol = `${settings.base_asset}${settings.quote_asset}`;
    
    const orderData = {
      category: "linear",
      symbol: symbol
    };

    const bodyStr = JSON.stringify(orderData);
    const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, bodyStr);
    
    const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/order/cancel-all`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp.toString(),
        'Content-Type': 'application/json'
      },
      body: bodyStr
    });

    const data = await response.json();
    console.log('🔥 Bybit cancel orders response:', data);

    return {
      cancelled_orders: data.result?.list?.length || 0,
      exchange: "BYBIT",
      mode: apiKey.is_testnet ? "TESTNET ⚠️" : "LIVE ✅",
      note: `🔥 Все ордера отменены на Bybit ${apiKey.is_testnet ? '(Testnet)' : ''}`
    };
  } catch (error) {
    console.error('🔥 Cancel orders error:', error);
    throw new Error(`Ошибка отмены ордеров: ${error.message}`);
  }
}

async function closeAllPositions(apiKey: any, settings: any) {
  try {
    if (apiKey.exchange !== 'bybit') {
      throw new Error(`Закрытие позиций для ${apiKey.exchange} пока не поддерживается`);
    }

    // Сначала получаем позиции
    const positions = await getPositions(apiKey, settings);
    
    if (positions.length === 0) {
      return {
        closed_positions: 0,
        exchange: "BYBIT",
        mode: apiKey.is_testnet ? "TESTNET ⚠️" : "LIVE ✅",
        note: "📭 Нет открытых позиций для закрытия"
      };
    }

    console.log('🔥 Closing positions:', positions.length);

    let closedCount = 0;

    for (const position of positions) {
      try {
        const timestamp = Date.now();
        
        const orderData = {
          category: "linear",
          symbol: position.symbol,
          side: position.side === "Buy" ? "Sell" : "Buy",
          orderType: "Market",
          qty: position.size,
          reduceOnly: true,
          timeInForce: "IOC"
        };

        const bodyStr = JSON.stringify(orderData);
        const signature = await createBybitSignatureV2(apiKey.api_secret, timestamp.toString(), apiKey.api_key, bodyStr);
        
        const baseUrl = apiKey.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
        const url = `${baseUrl}/v5/order/create`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'X-BAPI-API-KEY': apiKey.api_key,
            'X-BAPI-SIGN': signature,
            'X-BAPI-SIGN-TYPE': '2',
            'X-BAPI-TIMESTAMP': timestamp.toString(),
            'Content-Type': 'application/json'
          },
          body: bodyStr
        });

        const data = await response.json();
        if (data.retCode === 0) {
          closedCount++;
          console.log('🔥 Position closed:', position.symbol);
        } else {
          console.error('🔥 Failed to close position:', position.symbol, data.retMsg);
        }
      } catch (error) {
        console.error('🔥 Error closing position:', position.symbol, error);
      }
    }

    return {
      closed_positions: closedCount,
      total_positions: positions.length,
      exchange: "BYBIT",
      mode: apiKey.is_testnet ? "TESTNET ⚠️" : "LIVE ✅",
      note: `🔥 Закрыто ${closedCount} из ${positions.length} позиций на Bybit ${apiKey.is_testnet ? '(Testnet)' : ''}`
    };
  } catch (error) {
    console.error('🔥 Close positions error:', error);
    throw new Error(`Ошибка закрытия позиций: ${error.message}`);
  }
}

// Утилиты
async function getCurrentPrice(symbol: string, isTestnet: boolean = false): Promise<number> {
  try {
    const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/market/tickers?category=linear&symbol=${symbol}`;
    
    console.log('🔥 Getting price from:', url);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('🔥 Price response:', data);
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit Price API Error: ${data.retMsg} (Code: ${data.retCode})`);
    }
    
    const price = parseFloat(data.result?.list?.[0]?.lastPrice || "0");
    if (price === 0) {
      throw new Error(`Не удалось получить цену для ${symbol}`);
    }
    
    console.log('🔥 Current price for', symbol, ':', price);
    return price;
  } catch (error) {
    console.error('🔥 Get price error:', error);
    throw new Error(`Ошибка получения цены: ${error.message}`);
  }
}

async function getSymbolInfo(symbol: string, isTestnet: boolean = false): Promise<any> {
  try {
    const baseUrl = isTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    const url = `${baseUrl}/v5/market/instruments-info?category=linear&symbol=${symbol}`;
    
    console.log('🔥 Getting symbol info from:', url);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('🔥 Symbol info response:', data);
    
    if (data.retCode !== 0 || !data.result?.list?.length) {
      throw new Error(`Символ ${symbol} не найден на Bybit. Проверьте настройки торговли.`);
    }
    
    const symbolInfo = data.result.list[0];
    console.log('🔥 Symbol info:', symbolInfo);
    return symbolInfo;
  } catch (error) {
    console.error('🔥 Symbol info error:', error);
    throw error;
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

async function createBybitSignatureV2(secret: string, timestamp: string, apiKey: string, body: string): Promise<string> {
  const message = timestamp + apiKey + body;
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