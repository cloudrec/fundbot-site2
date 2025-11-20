import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();
    console.log('Plisio action:', action, 'params:', params);

    switch (action) {
      case 'create_payment':
        return await createPlisioPayment(params);
      
      case 'verify_payment':
        return await verifyPlisioPayment(params, supabaseClient);
      
      case 'webhook':
        return await handlePlisioWebhook(params, supabaseClient);
      
      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('Plisio Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Check Edge Function logs for more details'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function createPlisioPayment(params: any) {
  try {
    const plisioApiKey = Deno.env.get('PLISIO_API_KEY');
    console.log('PLISIO_API_KEY exists:', !!plisioApiKey);
    console.log('PLISIO_API_KEY starts with sk_:', plisioApiKey?.startsWith('sk_'));
    
    if (!plisioApiKey) {
      throw new Error('PLISIO_API_KEY not configured in Supabase secrets');
    }
    
    if (!plisioApiKey.startsWith('sk_')) {
      throw new Error('Invalid PLISIO_API_KEY format. Must start with sk_live_ or sk_test_');
    }

    const { plan_id, email, amount, currency = 'USD' } = params;
    
    if (!plan_id || !email || !amount) {
      throw new Error('Missing required parameters: plan_id, email, amount');
    }

    // Создаем уникальный номер заказа
    const orderNumber = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('Creating Plisio payment:', {
      order_name: `Subscription: ${plan_id}`,
      order_number: orderNumber,
      amount: amount,
      currency: currency,
      email: email
    });

    // Вызываем Plisio API
    const plisioResponse = await fetch('https://plisio.net/api/v1/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: plisioApiKey,
        order_name: `Subscription: ${plan_id}`,
        order_number: orderNumber,
        amount: amount,
        source_currency: currency,
        currency: 'BTC', // Принимаем в Bitcoin
        email: email,
        callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/plisio_payments_fixed_2025_11_06_12_23`,
        success_url: 'https://fundbot.win/?payment=success',
        fail_url: 'https://fundbot.win/?payment=failed'
      })
    });

    const plisioData = await plisioResponse.json();
    console.log('Plisio response:', plisioData);

    if (!plisioResponse.ok || plisioData.status !== 'success') {
      throw new Error(`Plisio API error: ${plisioData.message || 'Unknown error'}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: plisioData.data.invoice_url,
        invoice_id: plisioData.data.id,
        order_number: orderNumber
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Create payment error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function verifyPlisioPayment(params: any, supabaseClient: any) {
  try {
    const { invoice_id } = params;
    
    if (!invoice_id) {
      throw new Error('Missing invoice_id');
    }

    const plisioApiKey = Deno.env.get('PLISIO_API_KEY');
    if (!plisioApiKey) {
      throw new Error('PLISIO_API_KEY not configured');
    }

    // Проверяем статус платежа в Plisio
    const response = await fetch(`https://plisio.net/api/v1/operations/${invoice_id}?api_key=${plisioApiKey}`);
    const data = await response.json();

    console.log('Payment verification result:', data);

    return new Response(
      JSON.stringify({
        success: true,
        status: data.data?.status || 'unknown',
        payment_data: data.data
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Verify payment error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function handlePlisioWebhook(params: any, supabaseClient: any) {
  try {
    console.log('Plisio webhook received:', params);
    
    // Здесь обрабатываем webhook от Plisio
    // Обновляем статус подписки пользователя
    
    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}