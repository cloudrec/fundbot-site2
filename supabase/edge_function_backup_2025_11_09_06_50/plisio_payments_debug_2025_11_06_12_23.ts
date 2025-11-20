import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  console.log('=== PLISIO PAYMENT REQUEST START ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Supabase client created');

    const requestBody = await req.json();
    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    const { action, ...params } = requestBody;
    console.log('Action:', action);
    console.log('Params:', JSON.stringify(params, null, 2));

    switch (action) {
      case 'create_payment':
        return await createPlisioPayment(params);
      
      case 'verify_payment':
        return await verifyPlisioPayment(params, supabaseClient);
      
      case 'webhook':
        return await handlePlisioWebhook(params, supabaseClient);
      
      default:
        console.error('Invalid action:', action);
        throw new Error(`Invalid action: ${action}`);
    }

  } catch (error) {
    console.error('=== PLISIO ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('=== END ERROR ===');
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Check Edge Function logs for more details',
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function createPlisioPayment(params: any) {
  console.log('=== CREATE PLISIO PAYMENT START ===');
  
  try {
    // Проверяем API ключ
    const plisioApiKey = Deno.env.get('PLISIO_API_KEY');
    console.log('PLISIO_API_KEY exists:', !!plisioApiKey);
    console.log('PLISIO_API_KEY length:', plisioApiKey?.length || 0);
    console.log('PLISIO_API_KEY first 10 chars:', plisioApiKey?.substring(0, 10) || 'N/A');
    
    if (!plisioApiKey) {
      throw new Error('PLISIO_API_KEY not found in environment variables');
    }

    const { plan_id, email, amount, currency = 'USD' } = params;
    console.log('Payment params:', { plan_id, email, amount, currency });
    
    if (!plan_id || !email || !amount) {
      throw new Error(`Missing required parameters. Got: plan_id=${plan_id}, email=${email}, amount=${amount}`);
    }

    // Создаем уникальный номер заказа
    const orderNumber = `FUNDBOT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('Generated order number:', orderNumber);
    
    // Подготавливаем данные для Plisio
    const plisioPayload = {
      api_key: plisioApiKey,
      order_name: `FundBot Subscription: ${plan_id}`,
      order_number: orderNumber,
      amount: parseFloat(amount),
      source_currency: currency,
      currency: 'BTC', // Принимаем в Bitcoin
      email: email,
      callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/plisio_payments_debug_2025_11_06_12_23`,
      success_url: 'https://fundbot.win/?payment=success',
      fail_url: 'https://fundbot.win/?payment=failed'
    };

    console.log('Plisio payload:', JSON.stringify(plisioPayload, null, 2));

    // Вызываем Plisio API
    console.log('Calling Plisio API...');
    const plisioResponse = await fetch('https://plisio.net/api/v1/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FundBot/1.0'
      },
      body: JSON.stringify(plisioPayload)
    });

    console.log('Plisio response status:', plisioResponse.status);
    console.log('Plisio response headers:', Object.fromEntries(plisioResponse.headers.entries()));

    const plisioData = await plisioResponse.json();
    console.log('Plisio response data:', JSON.stringify(plisioData, null, 2));

    if (!plisioResponse.ok) {
      throw new Error(`Plisio HTTP error: ${plisioResponse.status} ${plisioResponse.statusText}`);
    }

    if (plisioData.status !== 'success') {
      throw new Error(`Plisio API error: ${plisioData.message || JSON.stringify(plisioData)}`);
    }

    if (!plisioData.data || !plisioData.data.invoice_url) {
      throw new Error(`Invalid Plisio response: missing invoice_url. Response: ${JSON.stringify(plisioData)}`);
    }

    const result = {
      success: true,
      payment_url: plisioData.data.invoice_url,
      invoice_id: plisioData.data.id,
      order_number: orderNumber,
      plisio_data: plisioData.data
    };

    console.log('Payment created successfully:', JSON.stringify(result, null, 2));
    console.log('=== CREATE PLISIO PAYMENT END ===');

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('=== CREATE PAYMENT ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('=== END CREATE PAYMENT ERROR ===');
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        debug_info: 'Check Edge Function logs for detailed error information'
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function verifyPlisioPayment(params: any, supabaseClient: any) {
  console.log('=== VERIFY PLISIO PAYMENT ===');
  
  try {
    const { invoice_id } = params;
    
    if (!invoice_id) {
      throw new Error('Missing invoice_id parameter');
    }

    const plisioApiKey = Deno.env.get('PLISIO_API_KEY');
    if (!plisioApiKey) {
      throw new Error('PLISIO_API_KEY not configured');
    }

    console.log('Verifying payment for invoice:', invoice_id);

    // Проверяем статус платежа в Plisio
    const response = await fetch(`https://plisio.net/api/v1/operations/${invoice_id}?api_key=${plisioApiKey}`);
    const data = await response.json();

    console.log('Payment verification result:', JSON.stringify(data, null, 2));

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
  console.log('=== PLISIO WEBHOOK ===');
  console.log('Webhook data:', JSON.stringify(params, null, 2));
  
  try {
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