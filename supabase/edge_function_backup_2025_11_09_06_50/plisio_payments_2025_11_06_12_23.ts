import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface PlisioPaymentRequest {
  order_name: string;
  order_number: string;
  amount: number;
  currency: string;
  email: string;
  callback_url?: string;
  success_url?: string;
  fail_url?: string;
}

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
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function createPlisioPayment(params: PlisioPaymentRequest) {
  const plisioApiKey = Deno.env.get('PLISIO_API_KEY');
  
  if (!plisioApiKey) {
    throw new Error('Plisio API key not configured');
  }

  const plisioUrl = 'https://plisio.net/api/v1/invoices/new';
  
  const requestBody = new URLSearchParams({
    api_key: plisioApiKey,
    order_name: params.order_name,
    order_number: params.order_number,
    amount: params.amount.toString(),
    source_currency: params.currency,
    currency: 'BTC', // Можно изменить на другую криптовалюту
    email: params.email,
    callback_url: params.callback_url || '',
    success_url: params.success_url || '',
    fail_url: params.fail_url || '',
  });

  const response = await fetch(plisioUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: requestBody,
  });

  const result = await response.json();
  
  if (result.status === 'error') {
    throw new Error(result.data?.message || 'Plisio payment creation failed');
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      payment_url: result.data.invoice_url,
      invoice_id: result.data.id,
      amount: result.data.amount,
      currency: result.data.source_currency
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

async function verifyPlisioPayment(params: { invoice_id: string }, supabaseClient: any) {
  const plisioApiKey = Deno.env.get('PLISIO_API_KEY');
  
  if (!plisioApiKey) {
    throw new Error('Plisio API key not configured');
  }

  const verifyUrl = `https://plisio.net/api/v1/operations/${params.invoice_id}?api_key=${plisioApiKey}`;
  
  const response = await fetch(verifyUrl);
  const result = await response.json();
  
  if (result.status === 'error') {
    throw new Error(result.data?.message || 'Payment verification failed');
  }

  const payment = result.data;
  const isPaid = payment.status === 'completed' || payment.status === 'mismatch';

  return new Response(
    JSON.stringify({ 
      success: true, 
      is_paid: isPaid,
      status: payment.status,
      amount: payment.amount,
      currency: payment.source_currency
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

async function handlePlisioWebhook(params: any, supabaseClient: any) {
  // Обработка webhook от Plisio
  console.log('Plisio webhook received:', params);
  
  const { invoice_id, status, email, order_number } = params;
  
  if (status === 'completed' || status === 'mismatch') {
    // Платеж успешен - активируем пользователя
    const { error } = await supabaseClient
      .from('user_subscriptions_2025_11_06_12_23')
      .upsert({
        email: email,
        invoice_id: invoice_id,
        order_number: order_number,
        status: 'active',
        activated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 дней
      });
    
    if (error) {
      console.error('Error activating subscription:', error);
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}