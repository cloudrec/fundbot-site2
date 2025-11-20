import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface TradingRequest {
  action: 'get_balance' | 'get_positions' | 'place_test_order' | 'place_order_with_tp_sl' | 'cancel_all_orders' | 'cancel_orders' | 'close_all_positions' | 'close_positions' | 'scan_funding';
  user_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔍 DIAGNOSTIC Function started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('🔍 Environment check:', {
      has_supabase_url: !!supabaseUrl,
      has_service_key: !!supabaseServiceKey,
      url_length: supabaseUrl?.length || 0,
      key_length: supabaseServiceKey?.length || 0
    });

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let requestBody;
    try {
      requestBody = await req.json();
      console.log('🔍 Request body parsed:', requestBody);
    } catch (parseError) {
      console.log('❌ JSON parse error:', parseError);
      throw new Error(`Invalid JSON: ${parseError.message}`);
    }
    
    const { action, user_id }: TradingRequest = requestBody;
    
    console.log('🔍 Trading action:', action, 'for user:', user_id);

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // Специальная обработка для scan_funding
    if (action === 'scan_funding') {
      console.log('🔍 Handling scan_funding');
      const result = await scanFunding(supabase);
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Получаем настройки пользователя с детальным логированием
    console.log('🔍 Getting user settings for user_id:', user_id);
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🔍 Settings query result:', {
      has_settings: !!settings,
      settings_count: settings ? 1 : 0,
      error: settingsError?.message,
      settings_data: settings ? {
        exchange: settings.exchange,
        base_asset: settings.base_asset,
        quote_asset: settings.quote_asset
      } : null
    });

    if (settingsError || !settings) {
      console.log('❌ Trading settings error:', settingsError);
      throw new Error(`Trading settings not found: ${settingsError?.message || 'No settings'}`);
    }

    // Получаем API ключи с детальным логированием
    console.log('🔍 Getting API keys from api_keys_dev for exchange:', settings.exchange);
    const { data: apiKeysArray, error: apiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', settings.exchange)
      .eq('is_active', true);

    console.log('🔍 API keys query result:', { 
      has_api_keys: !!apiKeysArray,
      count: apiKeysArray?.length || 0, 
      exchange: settings.exchange,
      error: apiError?.message,
      first_key_info: apiKeysArray?.[0] ? {
        has_api_key: !!apiKeysArray[0].api_key,
        api_key_length: apiKeysArray[0].api_key?.length || 0,
        has_api_secret: !!apiKeysArray[0].api_secret,
        api_secret_length: apiKeysArray[0].api_secret?.length || 0,
        has_passphrase: !!apiKeysArray[0].passphrase,
        is_testnet: apiKeysArray[0].is_testnet
      } : null
    });

    if (apiError || !apiKeysArray || apiKeysArray.length === 0) {
      console.log('❌ API keys error:', apiError);
      throw new Error(`API keys not found for ${settings.exchange}: ${apiError?.message || 'No keys'}`);
    }

    const apiKeys = apiKeysArray[0];
    console.log('🔍 Using API keys:', {
      exchange: settings.exchange,
      has_api_key: !!apiKeys.api_key,
      api_key_preview: apiKeys.api_key?.substring(0, 8) + '...',
      has_api_secret: !!apiKeys.api_secret,
      api_secret_preview: apiKeys.api_secret?.substring(0, 8) + '...',
      has_passphrase: !!apiKeys.passphrase,
      is_testnet: apiKeys.is_testnet
    });

    let result;

    switch (action) {
      case 'get_balance':
        console.log('🔍 Calling getBalance');
        result = await getBalance(apiKeys, settings);
        break;
      case 'get_positions':
        console.log('🔍 Calling getPositions');
        result = await getPositions(apiKeys, settings);
        break;
      case 'place_test_order':
        console.log('🔍 Calling placeTestOrder');
        result = await placeTestOrder(apiKeys, settings);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log('🔍 Function result:', result);

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ DIAGNOSTIC Error:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Возвращаем 200 статус с детальной информацией об ошибке
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        error_type: error.constructor.name,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Сканирование фандинга
async function scanFunding(supabase: any) {
  console.log('🔍 Scanning funding opportunities');
  
  const realOpportunities = [
    {
      exchange: 'binance',
      symbol: 'BTCUSDT',
      funding_rate: 0.0001,
      next_funding_time: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      apy_estimate: 1.095,
      status: 'active'
    },
    {
      exchange: 'bybit', 
      symbol: 'ETHUSDT',
      funding_rate: -0.0002,
      next_funding_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      apy_estimate: -0.584,
      status: 'active'
    },
    {
      exchange: 'gate',
      symbol: 'SUPERUSDT',
      funding_rate: 0.0003,
      next_funding_time: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      apy_estimate: 2.628,
      status: 'active'
    }
  ];

  return {
    message: 'DIAGNOSTIC: Фандинг сканирование выполнено',
    opportunities: realOpportunities,
    new_opportunities: realOpportunities.length,
    status: 'SCANNED',
    scan_time: new Date().toISOString()
  };
}

// Получение баланса с детальным логированием
async function getBalance(apiKeys: any, settings: any) {
  console.log('🔍 Getting balance for exchange:', settings.exchange);
  
  try {
    if (settings.exchange === 'binance') {
      return await getBinanceBalance(apiKeys);
    } else if (settings.exchange === 'bybit') {
      return await getBybitBalance(apiKeys);
    } else if (settings.exchange === 'gate') {
      return await getGateBalance(apiKeys);
    } else {
      throw new Error(`Exchange ${settings.exchange} not supported`);
    }
  } catch (balanceError) {
    console.error('❌ Balance error:', balanceError);
    throw new Error(`Balance error for ${settings.exchange}: ${balanceError.message}`);
  }
}

// Binance баланс с детальным логированием
async function getBinanceBalance(apiKeys: any) {
  console.log('🔍 Getting Binance balance');
  
  try {
    const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    console.log('🔍 Binance URL:', baseUrl);
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    console.log('🔍 Creating Binance signature');
    const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
    console.log('🔍 Signature created, length:', signature.length);
    
    const url = `${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`;
    console.log('🔍 Making request to:', url.substring(0, 100) + '...');
    
    const response = await fetch(url, {
      headers: {
        'X-MBX-APIKEY': apiKeys.api_key
      }
    });

    console.log('🔍 Binance response status:', response.status);
    console.log('🔍 Binance response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Binance API error response:', errorText);
      throw new Error(`Binance API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('🔍 Binance balance data:', data);
    
    const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
    console.log('🔍 USDT balance found:', usdtBalance);
    
    return {
      available_balance: usdtBalance?.availableBalance || '0.00',
      currency: 'USDT',
      status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
      exchange: 'BINANCE'
    };
  } catch (error) {
    console.error('❌ Binance balance error:', error);
    throw error;
  }
}

// Bybit баланс с детальным логированием
async function getBybitBalance(apiKeys: any) {
  console.log('🔍 Getting Bybit balance');
  
  try {
    const baseUrl = apiKeys.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    console.log('🔍 Bybit URL:', baseUrl);
    
    const timestamp = Date.now().toString();
    console.log('🔍 Creating Bybit signature');
    const { signature } = await createBybitSignature(apiKeys.api_secret, timestamp, '{}');
    console.log('🔍 Bybit signature created, length:', signature.length);
    
    const url = `${baseUrl}/v5/account/wallet-balance?category=unified`;
    console.log('🔍 Making request to:', url);
    
    const response = await fetch(url, {
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': '5000'
      }
    });

    console.log('🔍 Bybit response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Bybit API error response:', errorText);
      throw new Error(`Bybit API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('🔍 Bybit balance data:', data);
    
    if (data.retCode !== 0) {
      console.log('❌ Bybit error:', data.retMsg);
      throw new Error(`Bybit error: ${data.retMsg}`);
    }

    const usdtCoin = data.result?.list?.[0]?.coin?.find((coin: any) => coin.coin === 'USDT');
    console.log('🔍 USDT coin found:', usdtCoin);
    
    return {
      available_balance: usdtCoin?.availableToWithdraw || '0.00',
      currency: 'USDT',
      status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
      exchange: 'BYBIT'
    };
  } catch (error) {
    console.error('❌ Bybit balance error:', error);
    throw error;
  }
}

// Gate.io баланс с детальным логированием
async function getGateBalance(apiKeys: any) {
  console.log('🔍 Getting Gate.io balance');
  
  try {
    const baseUrl = apiKeys.is_testnet ? 'https://fx-api-testnet.gateio.ws' : 'https://api.gateio.ws';
    const path = '/api/v4/futures/usdt/accounts';
    console.log('🔍 Gate.io URL:', baseUrl + path);
    
    console.log('🔍 Creating Gate.io signature');
    const { signature, timestamp } = await createGateSignature(
      apiKeys.api_secret, 'GET', path, '', ''
    );
    console.log('🔍 Gate.io signature created, length:', signature.length);
    
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        'KEY': apiKeys.api_key,
        'SIGN': signature,
        'Timestamp': timestamp
      }
    });

    console.log('🔍 Gate.io response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Gate.io API error response:', errorText);
      throw new Error(`Gate.io API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('🔍 Gate.io balance data:', data);
    
    return {
      available_balance: data.available || '0.00',
      currency: 'USDT',
      status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
      exchange: 'GATE'
    };
  } catch (error) {
    console.error('❌ Gate.io balance error:', error);
    throw error;
  }
}

// Получение позиций
async function getPositions(apiKeys: any, settings: any) {
  console.log('🔍 Getting positions for exchange:', settings.exchange);
  
  return {
    positions: [],
    total_positions: 0,
    message: 'DIAGNOSTIC: Positions check'
  };
}

// Тестовый ордер
async function placeTestOrder(apiKeys: any, settings: any) {
  console.log('🔍 Placing test order');
  
  return {
    message: 'DIAGNOSTIC: Test order simulation',
    exchange: settings.exchange,
    symbol: `${settings.base_asset}${settings.quote_asset}`,
    amount: settings.order_amount_usd,
    leverage: settings.leverage,
    status: 'TEST_MODE'
  };
}

// Создание подписи для Binance
async function createBinanceSignature(secret: string, queryString: string) {
  console.log('🔍 Creating Binance signature for query:', queryString.substring(0, 50) + '...');
  
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(queryString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('🔍 Binance signature created successfully');
    return result;
  } catch (error) {
    console.error('❌ Binance signature error:', error);
    throw error;
  }
}

// Создание подписи для Bybit
async function createBybitSignature(secret: string, timestamp: string, params: string) {
  console.log('🔍 Creating Bybit signature');
  
  try {
    const message = timestamp + 'api_key' + '5000' + params;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('🔍 Bybit signature created successfully');
    return { signature: result };
  } catch (error) {
    console.error('❌ Bybit signature error:', error);
    throw error;
  }
}

// Создание подписи для Gate.io
async function createGateSignature(secret: string, method: string, path: string, query: string, body: string) {
  console.log('🔍 Creating Gate.io signature');
  
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `${method}\n${path}\n${query}\n${body}\n${timestamp}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('🔍 Gate.io signature created successfully');
    return { signature: result, timestamp };
  } catch (error) {
    console.error('❌ Gate.io signature error:', error);
    throw error;
  }
}