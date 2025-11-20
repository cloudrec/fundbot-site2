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
    console.log('🚀 BYBIT ONLY Function started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log('🚀 Request:', { action: requestBody.action, user_id: requestBody.user_id });
    
    const { action, user_id }: TradingRequest = requestBody;
    
    if (!user_id) {
      throw new Error('user_id is required');
    }

    let result;

    // Специальная обработка для scan_funding
    if (action === 'scan_funding') {
      result = await scanFunding(supabase);
    } else {
      // Получаем настройки пользователя
      const { data: settings, error: settingsError } = await supabase
        .from('trading_settings')
        .select('*')
        .eq('user_id', user_id)
        .single();

      if (settingsError || !settings) {
        throw new Error('Настройки торговли не найдены. Настройте параметры в разделе настроек.');
      }

      console.log('🚀 Settings from DB:', JSON.stringify(settings, null, 2));
      console.log('🚀 Exchange from settings:', settings.exchange);

      // ПРОВЕРЯЕМ: если не Bybit, то ошибка
      if (settings.exchange !== 'bybit') {
        throw new Error(`Эта функция работает только с Bybit. В настройках выбрано: ${settings.exchange}`);
      }

      // Получаем API ключи для Bybit
      const { data: apiKeysArray, error: apiError } = await supabase
        .from('api_keys_dev')
        .select('*')
        .eq('user_id', user_id)
        .eq('exchange', 'bybit')
        .eq('is_active', true);

      console.log('🚀 Bybit API keys query result:', {
        found_keys: apiKeysArray?.length || 0,
        error: apiError?.message
      });

      if (apiError || !apiKeysArray || apiKeysArray.length === 0) {
        throw new Error('API ключи для Bybit не найдены. Добавьте ключи в настройках.');
      }

      const apiKeys = apiKeysArray[0];
      console.log('🚀 Bybit API keys loaded:', {
        api_key_length: apiKeys.api_key?.length || 0,
        api_secret_length: apiKeys.api_secret?.length || 0,
        has_passphrase: !!apiKeys.passphrase,
        is_testnet: apiKeys.is_testnet
      });

      switch (action) {
        case 'get_balance':
          console.log('🚀 Calling Bybit balance function');
          result = await getBybitBalance(apiKeys);
          break;
        case 'get_positions':
          result = await getBybitPositions(apiKeys, settings);
          break;
        case 'place_test_order':
          result = await placeBybitTestOrder(apiKeys, settings);
          break;
        default:
          throw new Error(`Действие ${action} не реализовано для Bybit`);
      }
    }

    console.log('🚀 Final result:', JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ BYBIT ONLY Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Сканирование фандинга
async function scanFunding(supabase: any) {
  console.log('🚀 Scanning funding opportunities');
  
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
      message: 'BYBIT ONLY: Фандинг сканирование выполнено',
      opportunities: opportunities,
      new_opportunities: opportunities.length,
      status: 'LIVE',
      scan_time: new Date().toISOString()
    };

  } catch (error) {
    throw new Error(`Funding scan failed: ${error.message}`);
  }
}

// Bybit баланс
async function getBybitBalance(apiKeys: any) {
  console.log('🚀 Getting Bybit balance - START');
  
  const baseUrl = apiKeys.is_testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
  
  const timestamp = Date.now().toString();
  const params = '{}';
  
  console.log('🚀 Creating Bybit signature...');
  const { signature } = await createBybitSignature(apiKeys.api_secret, timestamp, params);
  
  console.log('🚀 Bybit request details:', {
    baseUrl,
    timestamp,
    signature_length: signature.length,
    api_key_length: apiKeys.api_key?.length
  });
  
  const response = await fetch(`${baseUrl}/v5/account/wallet-balance?category=unified`, {
    headers: {
      'X-BAPI-API-KEY': apiKeys.api_key,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': '5000'
    }
  });

  console.log('🚀 Bybit API response:', {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log('🚀 Bybit error response:', errorText);
    throw new Error(`Bybit API ошибка: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('🚀 Bybit data received:', JSON.stringify(data, null, 2));
  
  if (data.retCode !== 0) {
    throw new Error(`Bybit ошибка: ${data.retMsg}`);
  }

  const usdtCoin = data.result?.list?.[0]?.coin?.find((coin: any) => coin.coin === 'USDT');
  console.log('🚀 USDT coin found:', usdtCoin);
  
  const result = {
    available_balance: parseFloat(usdtCoin?.availableToWithdraw || '0').toFixed(2),
    currency: 'USDT',
    status: apiKeys.is_testnet ? 'TESTNET ⚠️' : 'LIVE ✅',
    exchange: 'BYBIT'
  };
  
  console.log('🚀 Bybit balance result:', result);
  return result;
}

// Bybit позиции
async function getBybitPositions(apiKeys: any, settings: any) {
  console.log('🚀 Getting Bybit positions');
  
  return {
    positions: [],
    total_positions: 0,
    exchange: 'BYBIT',
    status: 'LIVE ✅'
  };
}

// Bybit тестовый ордер
async function placeBybitTestOrder(apiKeys: any, settings: any) {
  return {
    message: 'BYBIT ONLY: Тестовый ордер на Bybit',
    exchange: 'BYBIT',
    symbol: `${settings.base_asset}${settings.quote_asset}`,
    amount: settings.order_amount_usd,
    leverage: settings.leverage,
    status: 'TEST_MODE'
  };
}

// Bybit подпись
async function createBybitSignature(secret: string, timestamp: string, params: string) {
  console.log('🚀 Creating Bybit signature with:', {
    timestamp,
    params,
    secret_length: secret.length
  });
  
  const message = timestamp + 'api_key' + '5000' + params;
  console.log('🚀 Bybit signature message:', message);
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  console.log('🚀 Bybit signature created:', result.substring(0, 20) + '...');
  
  return { signature: result };
}