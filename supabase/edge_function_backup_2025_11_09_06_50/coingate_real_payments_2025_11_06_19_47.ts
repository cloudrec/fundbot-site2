import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  console.log('=== REAL COINGATE PAYMENT ===');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();
    console.log('CoinGate action:', action, 'params:', params);

    switch (action) {
      case 'create_payment':
        return await createCoinGatePayment(params, supabaseClient);
      
      case 'webhook':
        return await handleWebhook(params, supabaseClient);
      
      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('CoinGate Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false
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
    const { plan_id, email, amount, currency = 'USD', user_id } = params;
    
    console.log('Creating CoinGate payment:', {
      plan_id, email, amount, currency, user_id
    });
    
    if (!plan_id || !email || !amount || !user_id) {
      throw new Error('Missing required parameters');
    }

    const coinGateApiKey = Deno.env.get('COINGATE_API_KEY');
    if (!coinGateApiKey) {
      throw new Error('CoinGate API key not configured');
    }

    // Создаем уникальный номер заказа
    const orderNumber = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('Generated order:', { orderNumber });

    // Создаем платеж в CoinGate
    const coinGateResponse = await fetch('https://api.coingate.com/v2/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${coinGateApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: orderNumber,
        price_amount: amount,
        price_currency: currency,
        receive_currency: currency,
        title: `Crypto Trading Bot - ${plan_id}`,
        description: `Subscription plan: ${plan_id}`,
        callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/coingate_real_payments_2025_11_06_19_47`,
        cancel_url: `${Deno.env.get('FRONTEND_URL') || 'https://7hbcd3tzew.skywork.website'}`,
        success_url: `${Deno.env.get('FRONTEND_URL') || 'https://7hbcd3tzew.skywork.website'}?payment=success`,
        buyer_email: email,
      })
    });

    if (!coinGateResponse.ok) {
      const errorText = await coinGateResponse.text();
      console.error('CoinGate API error:', errorText);
      throw new Error(`CoinGate API error: ${coinGateResponse.status} - ${errorText}`);
    }

    const coinGateData = await coinGateResponse.json();
    console.log('CoinGate response:', coinGateData);

    // Сохраняем информацию о платеже в базе данных
    const { error: insertError } = await supabaseClient
      .from('user_subscriptions_dev')
      .insert({
        user_id: user_id,
        email: email,
        plan_id: plan_id,
        amount: amount,
        currency: currency,
        status: 'pending',
        invoice_id: coinGateData.id.toString(),
        order_number: orderNumber,
        payment_url: coinGateData.payment_url
      });

    if (insertError) {
      console.error('Error saving payment info:', insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }

    console.log('Payment info saved to database');

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: coinGateData.payment_url,
        invoice_id: coinGateData.id,
        order_number: orderNumber,
        message: `Платеж создан в CoinGate. Сумма: ${amount} ${currency}`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Create CoinGate payment error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function handleWebhook(params: any, supabaseClient: any) {
  try {
    console.log('CoinGate webhook received:', params);
    
    const { id, status, order_id } = params;
    
    if (!id || !status) {
      throw new Error('Invalid webhook data');
    }

    // Обновляем статус платежа в базе данных
    if (status === 'paid' || status === 'confirmed') {
      const { error } = await supabaseClient
        .from('user_subscriptions_dev')
        .update({ 
          status: 'active',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('invoice_id', id.toString());

      if (error) {
        console.error('Error updating subscription:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      console.log('Subscription activated for CoinGate order:', id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook processed'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}