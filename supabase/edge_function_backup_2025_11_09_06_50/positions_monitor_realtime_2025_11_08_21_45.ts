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
    const { user_id } = await req.json();
    
    console.log('📊 POSITIONS MONITOR: Getting positions for user:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем настройки пользователя
    const { data: settings } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (!settings) {
      throw new Error('Настройки пользователя не найдены');
    }

    // Получаем позиции со всех бирж
    const allPositions = [];

    try {
      // Binance позиции
      const binancePositions = await getBinancePositions();
      allPositions.push(...binancePositions);
    } catch (error) {
      console.log('⚠️ Binance positions error:', error.message);
    }

    try {
      // Bybit позиции
      const bybitPositions = await getBybitPositions();
      allPositions.push(...bybitPositions);
    } catch (error) {
      console.log('⚠️ Bybit positions error:', error.message);
    }

    try {
      // Gate.io позиции
      const gatePositions = await getGatePositions();
      allPositions.push(...gatePositions);
    } catch (error) {
      console.log('⚠️ Gate.io positions error:', error.message);
    }

    // Фильтруем только открытые позиции
    const openPositions = allPositions.filter(pos => Math.abs(parseFloat(pos.size)) > 0);

    console.log('📊 POSITIONS FOUND:', openPositions.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        positions: openPositions,
        total_positions: openPositions.length,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ POSITIONS MONITOR Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// 🔐 HMAC SHA256 для Binance
async function createBinanceSignature(queryString: string, secret: string): Promise<string> {
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
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 📊 BINANCE ПОЗИЦИИ
async function getBinancePositions() {
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    return [];
  }

  const baseUrl = 'https://fapi.binance.com';
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await createBinanceSignature(queryString, apiSecret);

  const response = await fetch(`${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Binance positions error: ${response.status}`);
  }

  const positions = await response.json();
  
  return positions
    .filter((pos: any) => parseFloat(pos.positionAmt) !== 0)
    .map((pos: any) => ({
      exchange: 'Binance',
      symbol: pos.symbol,
      side: parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT',
      size: Math.abs(parseFloat(pos.positionAmt)).toString(),
      entry_price: parseFloat(pos.entryPrice),
      mark_price: parseFloat(pos.markPrice),
      pnl: parseFloat(pos.unRealizedProfit),
      pnl_percentage: parseFloat(pos.percentage),
      margin: parseFloat(pos.isolatedMargin || '0'),
      leverage: pos.leverage
    }));
}

// 📊 BYBIT ПОЗИЦИИ
async function getBybitPositions() {
  const apiKey = Deno.env.get('BYBIT_API_KEY');
  const apiSecret = Deno.env.get('BYBIT_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    return [];
  }

  // Bybit V5 API для позиций
  const timestamp = Date.now().toString();
  const params = `category=linear&settleCoin=USDT`;
  
  // Создаем подпись для Bybit
  const message = timestamp + apiKey + '5000' + params;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const response = await fetch(`https://api.bybit.com/v5/position/list?${params}`, {
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': signatureHex,
      'X-BAPI-SIGN-TYPE': '2',
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': '5000',
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Bybit positions error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }

  return data.result.list
    .filter((pos: any) => parseFloat(pos.size) !== 0)
    .map((pos: any) => ({
      exchange: 'Bybit',
      symbol: pos.symbol,
      side: pos.side,
      size: pos.size,
      entry_price: parseFloat(pos.avgPrice || '0'),
      mark_price: parseFloat(pos.markPrice || '0'),
      pnl: parseFloat(pos.unrealisedPnl || '0'),
      pnl_percentage: parseFloat(pos.unrealisedPnl || '0') / parseFloat(pos.positionValue || '1') * 100,
      margin: parseFloat(pos.positionIM || '0'),
      leverage: pos.leverage
    }));
}

// 🔐 Gate.io подпись
async function generateGateSignature(method: string, url: string, queryString: string, body: string, timestamp: string, apiSecret: string) {
  const message = `${method}\n${url}\n${queryString}\n${body}\n${timestamp}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 📊 GATE.IO ПОЗИЦИИ
async function getGatePositions() {
  const apiKey = Deno.env.get('GATE_API_KEY');
  const apiSecret = Deno.env.get('GATE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    return [];
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = 'GET';
  const url = '/api/v4/futures/usdt/positions';
  const queryString = '';
  const body = '';

  const signature = await generateGateSignature(method, url, queryString, body, timestamp, apiSecret);

  const response = await fetch(`https://api.gateio.ws${url}`, {
    method: method,
    headers: {
      'KEY': apiKey,
      'Timestamp': timestamp,
      'SIGN': signature,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Gate.io positions error: ${response.status}`);
  }

  const positions = await response.json();
  
  return positions
    .filter((pos: any) => parseFloat(pos.size) !== 0)
    .map((pos: any) => ({
      exchange: 'Gate.io',
      symbol: pos.contract,
      side: parseFloat(pos.size) > 0 ? 'LONG' : 'SHORT',
      size: Math.abs(parseFloat(pos.size)).toString(),
      entry_price: parseFloat(pos.entry_price || '0'),
      mark_price: parseFloat(pos.mark_price || '0'),
      pnl: parseFloat(pos.unrealised_pnl || '0'),
      pnl_percentage: parseFloat(pos.unrealised_pnl || '0') / parseFloat(pos.position_value || '1') * 100,
      margin: parseFloat(pos.margin || '0'),
      leverage: pos.leverage || '1'
    }));
}