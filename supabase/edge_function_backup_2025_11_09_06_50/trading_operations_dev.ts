import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  console.log('=== DEV TRADING OPERATION START ===');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, exchange, symbol, user_id, ...params } = await req.json();
    
    console.log('DEV Trading operation:', { action, exchange, symbol, user_id, params });

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // Получаем API ключи пользователя из DEV таблицы
    const { data: apiKeyData, error: apiKeyError } = await supabaseClient
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', exchange)
      .single();

    if (apiKeyError || !apiKeyData) {
      console.error('API keys not found:', apiKeyError);
      throw new Error(`API ключи для биржи ${exchange} не найдены. Добавьте их в разделе API Ключи.`);
    }

    console.log('DEV: Found API keys for exchange:', exchange);

    let result;
    switch (action) {
      case 'get_balance':
        result = await getBalance(exchange, apiKeyData);
        break;
      case 'get_positions':
        result = await getPositions(exchange, apiKeyData);
        break;
      case 'place_order':
        result = await placeOrder(exchange, apiKeyData, symbol, params);
        break;
      case 'test_order':
        result = await placeTestOrder(exchange, apiKeyData, symbol, params);
        break;
      case 'cancel_orders':
        result = await cancelAllOrders(exchange, apiKeyData, symbol);
        break;
      case 'close_positions':
        result = await closeAllPositions(exchange, apiKeyData, symbol);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log('DEV: Operation result:', result);

    // Отправляем уведомление в Telegram
    try {
      await sendTelegramNotification(action, result, exchange, symbol);
    } catch (telegramError) {
      console.error('DEV: Telegram notification error:', telegramError);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('DEV: Trading operation error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: 'DEV environment - check logs for details'
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Функции для работы с Bybit
async function getBalance(exchange: string, apiKeys: any) {
  console.log('DEV: Getting balance for', exchange);
  
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const timestamp = Date.now().toString();
  const params = `accountType=UNIFIED&timestamp=${timestamp}`;
  const signature = await createSignature(params, apiKeys.api_secret);
  
  const url = `https://api${apiKeys.is_testnet ? '-testnet' : ''}.bybit.com/v5/account/wallet-balance?${params}&sign=${signature}`;
  
  console.log('DEV: Balance request URL:', url.replace(/api_key=[^&]*/, 'api_key=***'));
  
  const response = await fetch(url, {
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
    }
  });

  const data = await response.json();
  console.log('DEV: Balance response:', data);
  
  if (!response.ok || data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'}`);
  }

  return data;
}

async function getPositions(exchange: string, apiKeys: any) {
  console.log('DEV: Getting positions for', exchange);
  
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const timestamp = Date.now().toString();
  const params = `category=linear&timestamp=${timestamp}`;
  const signature = await createSignature(params, apiKeys.api_secret);
  
  const url = `https://api${apiKeys.is_testnet ? '-testnet' : ''}.bybit.com/v5/position/list?${params}&sign=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
    }
  });

  const data = await response.json();
  console.log('DEV: Positions response:', data);
  
  if (!response.ok || data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'}`);
  }

  return data;
}

async function placeOrder(exchange: string, apiKeys: any, symbol: string, params: any) {
  console.log('DEV: Placing real order for', exchange, symbol, params);
  
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const timestamp = Date.now().toString();
  const orderParams = {
    category: 'linear',
    symbol: symbol,
    side: params.side || 'Buy',
    orderType: 'Market',
    qty: params.qty || '0.01',
    timestamp: timestamp
  };

  const queryString = Object.entries(orderParams)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
    
  const signature = await createSignature(queryString, apiKeys.api_secret);
  
  const url = `https://api${apiKeys.is_testnet ? '-testnet' : ''}.bybit.com/v5/order/create`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderParams)
  });

  const data = await response.json();
  console.log('DEV: Order response:', data);
  
  if (!response.ok || data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'}`);
  }

  return data;
}

async function placeTestOrder(exchange: string, apiKeys: any, symbol: string, params: any) {
  console.log('DEV: Placing TEST order (simulation) for', exchange, symbol, params);
  
  // Симуляция тестового ордера - не отправляем на биржу
  const testResult = {
    retCode: 0,
    retMsg: 'OK',
    result: {
      orderId: `TEST_${Date.now()}`,
      orderLinkId: '',
    },
    time: Date.now(),
    test_mode: true,
    message: 'Тестовый ордер - не отправлен на биржу'
  };

  console.log('DEV: Test order result:', testResult);
  return testResult;
}

async function cancelAllOrders(exchange: string, apiKeys: any, symbol: string) {
  console.log('DEV: Cancelling all orders for', exchange, symbol);
  
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const timestamp = Date.now().toString();
  const params = `category=linear&symbol=${symbol}&timestamp=${timestamp}`;
  const signature = await createSignature(params, apiKeys.api_secret);
  
  const url = `https://api${apiKeys.is_testnet ? '-testnet' : ''}.bybit.com/v5/order/cancel-all`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category: 'linear',
      symbol: symbol
    })
  });

  const data = await response.json();
  console.log('DEV: Cancel orders response:', data);
  
  if (!response.ok || data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'}`);
  }

  return data;
}

async function closeAllPositions(exchange: string, apiKeys: any, symbol: string) {
  console.log('DEV: Closing all positions for', exchange, symbol);
  
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  // Сначала получаем открытые позиции
  const positions = await getPositions(exchange, apiKeys);
  
  if (!positions.result || !positions.result.list) {
    return { message: 'No positions to close', positions: [] };
  }

  const results = [];
  for (const position of positions.result.list) {
    if (parseFloat(position.size) > 0) {
      try {
        const closeResult = await placeOrder(exchange, apiKeys, position.symbol, {
          side: position.side === 'Buy' ? 'Sell' : 'Buy',
          qty: position.size
        });
        results.push({ success: true, symbol: position.symbol, result: closeResult });
      } catch (error) {
        console.error(`DEV: Error closing position ${position.symbol}:`, error);
        results.push({ success: false, symbol: position.symbol, error: error.message });
      }
    }
  }

  return { results, message: `Attempted to close ${results.length} positions` };
}

async function createSignature(message: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sendTelegramNotification(action: string, result: any, exchange: string, symbol: string) {
  const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');
  
  if (!telegramBotToken || !telegramChatId) {
    console.log('DEV: Telegram credentials not configured');
    return;
  }

  let message = `🧪 DEV FundBot - ${exchange.toUpperCase()}\n`;
  message += `📊 Действие: ${action}\n`;
  message += `💱 Пара: ${symbol}\n`;
  message += `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n`;
  
  if (result.test_mode) {
    message += `🧪 ТЕСТОВЫЙ РЕЖИМ\n`;
  }
  
  if (result.retCode === 0 || result.success !== false) {
    message += `✅ Статус: Успешно`;
    if (result.result?.orderId) {
      message += `\n📝 ID ордера: ${result.result.orderId}`;
    }
  } else {
    message += `❌ Статус: Ошибка\n`;
    message += `📝 Детали: ${result.retMsg || result.error || 'Unknown error'}`;
  }

  try {
    await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    console.log('DEV: Telegram notification sent');
  } catch (error) {
    console.error('DEV: Failed to send Telegram notification:', error);
  }
}