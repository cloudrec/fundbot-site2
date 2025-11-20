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

    const { action, exchange, symbol, user_id, ...params } = await req.json();
    
    console.log('Trading operation:', { action, exchange, symbol, user_id });

    // Получаем API ключи пользователя из базы данных
    const { data: apiKeyData, error: apiKeyError } = await supabaseClient
      .from('api_keys_2025_11_06_12_23')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', exchange)
      .single();

    if (apiKeyError || !apiKeyData) {
      throw new Error(`API ключи для биржи ${exchange} не найдены. Добавьте их в разделе API Ключи.`);
    }

    console.log('Found API keys for exchange:', exchange);

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
      case 'cancel_orders':
        result = await cancelAllOrders(exchange, apiKeyData, symbol);
        break;
      case 'close_positions':
        result = await closeAllPositions(exchange, apiKeyData, symbol);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Отправляем уведомление в Telegram (если настроено)
    try {
      await sendTelegramNotification(action, result, exchange, symbol);
    } catch (telegramError) {
      console.error('Telegram notification error:', telegramError);
      // Не прерываем выполнение из-за ошибки Telegram
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Trading operation error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
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
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const timestamp = Date.now().toString();
  const params = `timestamp=${timestamp}`;
  const signature = await createSignature(params, apiKeys.api_secret);
  
  const response = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${params}&sign=${signature}`, {
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
    }
  });

  const data = await response.json();
  console.log('Balance response:', data);
  
  if (!response.ok) {
    throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'}`);
  }

  return data;
}

async function getPositions(exchange: string, apiKeys: any) {
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const timestamp = Date.now().toString();
  const params = `category=linear&timestamp=${timestamp}`;
  const signature = await createSignature(params, apiKeys.api_secret);
  
  const response = await fetch(`https://api.bybit.com/v5/position/list?${params}&sign=${signature}`, {
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
    }
  });

  const data = await response.json();
  console.log('Positions response:', data);
  
  if (!response.ok) {
    throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'}`);
  }

  return data;
}

async function placeOrder(exchange: string, apiKeys: any, symbol: string, params: any) {
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
  
  const response = await fetch('https://api.bybit.com/v5/order/create', {
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
  console.log('Order response:', data);
  
  if (!response.ok) {
    throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'}`);
  }

  return data;
}

async function cancelAllOrders(exchange: string, apiKeys: any, symbol: string) {
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  const timestamp = Date.now().toString();
  const params = `category=linear&symbol=${symbol}&timestamp=${timestamp}`;
  const signature = await createSignature(params, apiKeys.api_secret);
  
  const response = await fetch('https://api.bybit.com/v5/order/cancel-all', {
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
  console.log('Cancel orders response:', data);
  
  if (!response.ok) {
    throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'}`);
  }

  return data;
}

async function closeAllPositions(exchange: string, apiKeys: any, symbol: string) {
  if (exchange !== 'bybit') {
    throw new Error(`Exchange ${exchange} not supported yet`);
  }

  // Сначала получаем открытые позиции
  const positions = await getPositions(exchange, apiKeys);
  
  if (!positions.result || !positions.result.list) {
    return { message: 'No positions to close' };
  }

  const results = [];
  for (const position of positions.result.list) {
    if (parseFloat(position.size) > 0) {
      try {
        const closeResult = await placeOrder(exchange, apiKeys, position.symbol, {
          side: position.side === 'Buy' ? 'Sell' : 'Buy',
          qty: position.size
        });
        results.push(closeResult);
      } catch (error) {
        console.error(`Error closing position ${position.symbol}:`, error);
        results.push({ error: error.message, symbol: position.symbol });
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
    console.log('Telegram credentials not configured');
    return;
  }

  let message = `🤖 FundBot - ${exchange.toUpperCase()}\n`;
  message += `📊 Действие: ${action}\n`;
  message += `💱 Пара: ${symbol}\n`;
  message += `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n`;
  
  if (result.success !== false) {
    message += `✅ Статус: Успешно`;
  } else {
    message += `❌ Статус: Ошибка\n`;
    message += `📝 Детали: ${result.error || 'Unknown error'}`;
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
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
  }
}