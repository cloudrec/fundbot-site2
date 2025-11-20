import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  console.log('=== DEV COINGATE PAYMENT REQUEST START ===');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();
    console.log('DEV CoinGate action:', action, 'params:', params);

    switch (action) {
      case 'create_payment':
        return await createCoinGatePayment(params, supabaseClient);
      
      case 'verify_payment':
        return await verifyCoinGatePayment(params, supabaseClient);
      
      case 'webhook':
        return await handleCoinGateWebhook(params, supabaseClient);
      
      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('DEV CoinGate Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'DEV environment - Check Edge Function logs for more details'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function createCoinGatePayment(params: any, supabaseClient: any) {
  try {
    // Для DEV версии создаем симуляцию платежа
    const { plan_id, email, amount, currency = 'USD' } = params;
    
    console.log('DEV: Creating simulated CoinGate payment:', {
      plan_id, email, amount, currency
    });
    
    if (!plan_id || !email || !amount) {
      throw new Error('Missing required parameters: plan_id, email, amount');
    }

    // Создаем уникальный номер заказа
    const orderNumber = `DEV_ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // В DEV режиме симулируем успешный ответ от CoinGate
    const simulatedResponse = {
      id: Math.floor(Math.random() * 1000000),
      status: 'new',
      price_amount: amount,
      price_currency: currency,
      receive_currency: 'BTC',
      title: `FundBot Subscription: ${plan_id}`,
      description: `Subscription for ${email}`,
      order_id: orderNumber,
      payment_url: `https://coingate.com/invoice/${Math.floor(Math.random() * 1000000)}`,
      created_at: new Date().toISOString(),
      token: `dev_token_${Math.random().toString(36).substr(2, 16)}`
    };

    console.log('DEV: Simulated CoinGate response:', simulatedResponse);

    // Сохраняем информацию о платеже в DEV таблице
    const { error: insertError } = await supabaseClient
      .from('user_subscriptions_dev')
      .insert({
        user_id: params.user_id,
        email: email,
        plan_id: plan_id,
        amount: amount,
        currency: currency,
        status: 'pending',
        invoice_id: simulatedResponse.id.toString(),
        order_number: orderNumber
      });

    if (insertError) {
      console.error('DEV: Error saving payment info:', insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: simulatedResponse.payment_url,
        invoice_id: simulatedResponse.id,
        order_number: orderNumber,
        dev_mode: true,
        message: 'DEV: Симуляция платежа CoinGate'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('DEV: Create payment error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        dev_mode: true
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function verifyCoinGatePayment(params: any, supabaseClient: any) {
  try {
    const { invoice_id } = params;
    
    if (!invoice_id) {
      throw new Error('Missing invoice_id');
    }

    console.log('DEV: Verifying payment for invoice:', invoice_id);

    // В DEV режиме симулируем успешную оплату
    const simulatedStatus = {
      id: invoice_id,
      status: 'paid', // Всегда успешно в DEV
      price_amount: 29.99,
      price_currency: 'USD',
      receive_amount: 0.001,
      receive_currency: 'BTC',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('DEV: Simulated payment status:', simulatedStatus);

    return new Response(
      JSON.stringify({
        success: true,
        status: simulatedStatus.status,
        payment_data: simulatedStatus,
        dev_mode: true,
        message: 'DEV: Симуляция проверки платежа'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('DEV: Verify payment error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        dev_mode: true
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function handleCoinGateWebhook(params: any, supabaseClient: any) {
  try {
    console.log('DEV: CoinGate webhook received:', params);
    
    // В DEV режиме автоматически активируем подписку
    if (params.invoice_id) {
      const { error: updateError } = await supabaseClient
        .from('user_subscriptions_dev')
        .update({ 
          status: 'active',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 дней
        })
        .eq('invoice_id', params.invoice_id);

      if (updateError) {
        console.error('DEV: Error updating subscription:', updateError);
      } else {
        console.log('DEV: Subscription activated for invoice:', params.invoice_id);
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true,
        dev_mode: true,
        message: 'DEV: Webhook processed'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('DEV: Webhook error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        dev_mode: true
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Реальная интеграция с CoinGate (для продакшена)
async function createRealCoinGatePayment(params: any) {
  const coinGateApiKey = Deno.env.get('COINGATE_API_KEY');
  
  if (!coinGateApiKey) {
    throw new Error('COINGATE_API_KEY not configured');
  }

  const { plan_id, email, amount, currency = 'USD' } = params;
  const orderNumber = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const coinGatePayload = {
    order_id: orderNumber,
    price_amount: amount,
    price_currency: currency,
    receive_currency: 'BTC',
    title: `FundBot Subscription: ${plan_id}`,
    description: `Subscription for ${email}`,
    callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/coingate_payments_dev`,
    success_url: 'https://fundbot.win/?payment=success',
    cancel_url: 'https://fundbot.win/?payment=cancelled'
  };

  const response = await fetch('https://api.coingate.com/v2/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${coinGateApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(coinGatePayload)
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`CoinGate API error: ${data.message || 'Unknown error'}`);
  }

  return data;
}