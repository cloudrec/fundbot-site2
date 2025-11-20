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
    console.log('🔧 DIAGNOSTIC Function started - finding the error');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('🔧 Environment check:', {
      has_supabase_url: !!supabaseUrl,
      has_service_key: !!supabaseServiceKey,
      url_preview: supabaseUrl?.substring(0, 30) + '...',
      key_preview: supabaseServiceKey?.substring(0, 10) + '...'
    });

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing Supabase environment variables',
          details: {
            has_url: !!supabaseUrl,
            has_key: !!supabaseServiceKey
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let requestBody;
    try {
      requestBody = await req.json();
      console.log('🔧 Request parsed:', requestBody);
    } catch (parseError) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'JSON parse error',
          details: parseError.message
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { action, user_id }: TradingRequest = requestBody;
    
    console.log('🔧 Action:', action, 'User:', user_id);

    if (!user_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'user_id is required'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Специальная обработка для scan_funding
    if (action === 'scan_funding') {
      try {
        const result = await scanFunding();
        return new Response(
          JSON.stringify({ success: true, data: result }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (scanError) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Funding scan error',
            details: scanError.message
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Получаем настройки пользователя
    console.log('🔧 Getting user settings...');
    let settings;
    try {
      const { data: settingsData, error: settingsError } = await supabase
        .from('trading_settings')
        .select('*')
        .eq('user_id', user_id)
        .single();

      console.log('🔧 Settings query result:', {
        has_data: !!settingsData,
        error: settingsError?.message,
        data_preview: settingsData ? {
          exchange: settingsData.exchange,
          base_asset: settingsData.base_asset,
          quote_asset: settingsData.quote_asset
        } : null
      });

      if (settingsError || !settingsData) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Settings not found',
            details: {
              error_message: settingsError?.message,
              error_code: settingsError?.code,
              has_data: !!settingsData
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      settings = settingsData;
    } catch (settingsException) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Settings query exception',
          details: settingsException.message
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Получаем API ключи
    console.log('🔧 Getting API keys for exchange:', settings.exchange);
    let apiKeys;
    try {
      const { data: apiKeysArray, error: apiError } = await supabase
        .from('api_keys_dev')
        .select('*')
        .eq('user_id', user_id)
        .eq('exchange', settings.exchange)
        .eq('is_active', true);

      console.log('🔧 API keys query result:', {
        has_data: !!apiKeysArray,
        count: apiKeysArray?.length || 0,
        error: apiError?.message,
        exchange: settings.exchange
      });

      if (apiError || !apiKeysArray || apiKeysArray.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'API keys not found',
            details: {
              exchange: settings.exchange,
              error_message: apiError?.message,
              error_code: apiError?.code,
              has_data: !!apiKeysArray,
              count: apiKeysArray?.length || 0
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      apiKeys = apiKeysArray[0];
      console.log('🔧 API keys loaded:', {
        exchange: settings.exchange,
        api_key_length: apiKeys.api_key?.length || 0,
        api_secret_length: apiKeys.api_secret?.length || 0,
        has_passphrase: !!apiKeys.passphrase,
        is_testnet: apiKeys.is_testnet
      });
    } catch (apiException) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'API keys query exception',
          details: apiException.message
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Выполняем действие
    let result;
    try {
      switch (action) {
        case 'get_balance':
          result = await getBalance(apiKeys, settings);
          break;
        case 'get_positions':
          result = await getPositions(apiKeys, settings);
          break;
        case 'place_test_order':
          result = await placeTestOrder(apiKeys, settings);
          break;
        default:
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Unknown action',
              details: { action }
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
      }

      return new Response(
        JSON.stringify({ success: true, data: result }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (actionError) {
      console.error('🔧 Action error:', actionError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Action execution error',
          details: {
            action,
            exchange: settings.exchange,
            error_message: actionError.message,
            error_stack: actionError.stack
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (globalError) {
    console.error('🔧 Global error:', globalError);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Global function error',
        details: {
          error_message: globalError.message,
          error_stack: globalError.stack,
          error_type: globalError.constructor.name
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Сканирование фандинга
async function scanFunding() {
  console.log('🔧 Scanning funding opportunities');
  
  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const opportunities = data
      .filter((item: any) => parseFloat(item.lastFundingRate) !== 0)
      .sort((a: any, b: any) => Math.abs(parseFloat(b.lastFundingRate)) - Math.abs(parseFloat(a.lastFundingRate)))
      .slice(0, 5)
      .map((item: any) => ({
        exchange: 'binance',
        symbol: item.symbol,
        funding_rate: parseFloat(item.lastFundingRate),
        next_funding_time: new Date(item.nextFundingTime).toISOString(),
        apy_estimate: parseFloat(item.lastFundingRate) * 365 * 3,
        status: 'active'
      }));

    return {
      message: 'DIAGNOSTIC: Фандинг сканирование выполнено',
      opportunities: opportunities,
      new_opportunities: opportunities.length,
      status: 'LIVE',
      scan_time: new Date().toISOString()
    };

  } catch (error) {
    throw new Error(`Funding scan failed: ${error.message}`);
  }
}

// Получение баланса
async function getBalance(apiKeys: any, settings: any) {
  console.log('🔧 Getting balance for:', settings.exchange);
  
  try {
    switch (settings.exchange) {
      case 'binance':
        return await getBinanceBalance(apiKeys);
      case 'bybit':
        return await getBybitBalance(apiKeys);
      case 'gate':
        return await getGateBalance(apiKeys);
      default:
        throw new Error(`Exchange ${settings.exchange} not supported in diagnostic mode`);
    }
  } catch (balanceError) {
    throw new Error(`Balance error for ${settings.exchange}: ${balanceError.message}`);
  }
}

// Binance баланс
async function getBinanceBalance(apiKeys: any) {
  console.log('🔧 Getting Binance balance');
  
  try {
    const baseUrl = apiKeys.is_testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createBinanceSignature(apiKeys.api_secret, queryString);
    
    console.log('🔧 Binance request details:', {
      baseUrl,
      timestamp,
      signature_length: signature.length,
      api_key_length: apiKeys.api_key?.length
    });
    
    const response = await fetch(`${baseUrl}/fapi/v2/balance?${queryString}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKeys.api_key }
    });

    console.log('🔧 Binance response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('🔧 Binance error response:', errorText);
      throw new Error(`Binance API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('🔧 Binance data received:', { count: data.length });
    
    const usdtBalance = data.find((balance: any) => balance.asset === 'USDT');
    
    return {
      available_balance: parseFloat(usdtBalance?.availableBalance || '0').toFixed(2),
      currency: 'USDT',
      status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
      exchange: 'BINANCE'
    };
  } catch (error) {
    throw new Error(`Binance balance error: ${error.message}`);
  }
}

// Bybit баланс
async function getBybitBalance(apiKeys: any) {
  console.log('🔧 Getting Bybit balance');
  
  try {
    const baseUrl = apiKeys.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    
    const timestamp = Date.now().toString();
    const params = '{}';
    const { signature } = await createBybitSignature(apiKeys.api_secret, timestamp, params);
    
    console.log('🔧 Bybit request details:', {
      baseUrl,
      timestamp,
      signature_length: signature.length
    });
    
    const response = await fetch(`${baseUrl}/v5/account/wallet-balance?category=unified`, {
      headers: {
        'X-BAPI-API-KEY': apiKeys.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': '5000'
      }
    });

    console.log('🔧 Bybit response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('🔧 Bybit error response:', errorText);
      throw new Error(`Bybit API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('🔧 Bybit data received:', { retCode: data.retCode });
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit error: ${data.retMsg}`);
    }

    const usdtCoin = data.result?.list?.[0]?.coin?.find((coin: any) => coin.coin === 'USDT');
    
    return {
      available_balance: parseFloat(usdtCoin?.availableToWithdraw || '0').toFixed(2),
      currency: 'USDT',
      status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
      exchange: 'BYBIT'
    };
  } catch (error) {
    throw new Error(`Bybit balance error: ${error.message}`);
  }
}

// Gate.io баланс
async function getGateBalance(apiKeys: any) {
  console.log('🔧 Getting Gate.io balance');
  
  try {
    const baseUrl = apiKeys.is_testnet ? 'https://fx-api-testnet.gateio.ws' : 'https://api.gateio.ws';
    const path = '/api/v4/futures/usdt/accounts';
    
    const { signature, timestamp } = await createGateSignature(
      apiKeys.api_secret, 'GET', path, '', ''
    );
    
    console.log('🔧 Gate.io request details:', {
      baseUrl,
      path,
      timestamp,
      signature_length: signature.length
    });
    
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        'KEY': apiKeys.api_key,
        'SIGN': signature,
        'Timestamp': timestamp
      }
    });

    console.log('🔧 Gate.io response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('🔧 Gate.io error response:', errorText);
      throw new Error(`Gate.io API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('🔧 Gate.io data received:', data);
    
    return {
      available_balance: parseFloat(data.available || '0').toFixed(2),
      currency: 'USDT',
      status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
      exchange: 'GATE'
    };
  } catch (error) {
    throw new Error(`Gate.io balance error: ${error.message}`);
  }
}

// Получение позиций
async function getPositions(apiKeys: any, settings: any) {
  return {
    positions: [],
    total_positions: 0,
    exchange: settings.exchange.toUpperCase(),
    status: 'DIAGNOSTIC'
  };
}

// Тестовый ордер
async function placeTestOrder(apiKeys: any, settings: any) {
  return {
    message: `DIAGNOSTIC: Тестовый ордер на ${settings.exchange.toUpperCase()}`,
    exchange: settings.exchange.toUpperCase(),
    symbol: `${settings.base_asset}${settings.quote_asset}`,
    amount: settings.order_amount_usd,
    leverage: settings.leverage,
    status: 'DIAGNOSTIC'
  };
}

// Подписи

// Binance подпись
async function createBinanceSignature(secret: string, queryString: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(queryString);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Bybit подпись
async function createBybitSignature(secret: string, timestamp: string, params: string) {
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
  
  return { signature: result };
}

// Gate.io подпись
async function createGateSignature(secret: string, method: string, path: string, query: string, body: string) {
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
  
  return { signature: result, timestamp };
}