import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
}

// HMAC-SHA256 подпись для Gate.io
async function createSignature(secret: string, message: string): Promise<string> {
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
  
  // Gate.io использует hex формат
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🎯 Gate.io FUTURES ONLY Function Started');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, exchange } = await req.json()
    console.log(`🎯 Action: ${action}, Exchange: ${exchange}`)

    if (action === 'check_balance' && exchange === 'gate') {
      // Получаем API ключи
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        throw new Error('Authorization header required')
      }

      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
      
      if (userError || !user) {
        throw new Error('Invalid token')
      }

      console.log('👤 User ID:', user.id);

      const { data: apiKeyData, error: keyError } = await supabaseClient
        .from('api_keys_2025_11_12_05_30')
        .select('*')
        .eq('user_id', user.id)
        .eq('exchange', 'gate')
        .single()

      if (keyError || !apiKeyData) {
        console.log('❌ No API keys found for Gate.io');
        return new Response(JSON.stringify({
          success: false,
          exchange: 'gate',
          balance: {
            exchange: 'gate',
            USDT: { total: 1000, available: 800 },
            BTC: { total: 0.05, available: 0.04 },
            total_usdt: 1000,
            is_demo: true
          },
          error: 'No API keys configured for Gate.io',
          is_demo: true,
          timestamp: new Date().toISOString()
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('✅ Found API keys for Gate.io');

      try {
        // Gate.io FUTURES API call
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const method = 'GET';
        const url = '/api/v4/futures/usdt/accounts';  // FUTURES endpoint!
        const queryString = '';
        const body = '';
        
        // Gate.io правильная строка подписи (БЕЗ Passphrase!)
        const signString = `${method}\n${url}\n${queryString}\n${body}\n${timestamp}`;
        const signature = await createSignature(apiKeyData.secret, signString);
        
        console.log('📝 Gate.io FUTURES request:', { 
          method, 
          url, 
          timestamp,
          signString: signString.replace(/\n/g, '\\n')
        });
        
        const response = await fetch(`https://api.gateio.ws${url}`, {
          method: 'GET',
          headers: {
            'KEY': apiKeyData.api_key,
            'SIGN': signature,
            'Timestamp': timestamp,
            'Content-Type': 'application/json'
            // НЕТ Passphrase заголовка для Gate.io!
          }
        });
        
        const data = await response.json();
        console.log('📊 Gate.io FUTURES response:', response.status, data);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
        }
        
        // Парсим баланс фьючерсов
        let usdtBalance = { total: 0, available: 0 };
        
        if (data && data.total) {
          usdtBalance = {
            total: parseFloat(data.total || '0'),
            available: parseFloat(data.available || '0')
          };
        }
        
        const balance = {
          exchange: 'gate',
          USDT: usdtBalance,
          BTC: { total: 0, available: 0 },
          total_usdt: usdtBalance.total
        };

        return new Response(JSON.stringify({
          success: true,
          exchange: 'gate',
          balance: balance,
          error: null,
          is_demo: false,
          timestamp: new Date().toISOString()
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
        
      } catch (error: any) {
        console.error('❌ Gate.io FUTURES error:', error.message);
        return new Response(JSON.stringify({
          success: false,
          exchange: 'gate',
          balance: {
            exchange: 'gate',
            USDT: { total: 1000, available: 800 },
            BTC: { total: 0.05, available: 0.04 },
            total_usdt: 1000,
            is_demo: true,
            error: `API Error: ${error.message}`
          },
          error: `API Error: ${error.message}`,
          is_demo: true,
          timestamp: new Date().toISOString()
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Invalid action or exchange. Use action: "check_balance" with exchange: "gate"' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('💥 Function error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
