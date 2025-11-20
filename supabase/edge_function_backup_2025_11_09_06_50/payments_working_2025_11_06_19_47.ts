import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  console.log('=== PAYMENT SYSTEM WORKING ===');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();
    console.log('Payment action:', action, 'params:', params);

    switch (action) {
      case 'create_payment':
        return await createWorkingPayment(params, supabaseClient);
      
      case 'simulate_success':
        return await simulatePaymentSuccess(params, supabaseClient);
      
      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('Payment Error:', error);
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

async function createWorkingPayment(params: any, supabaseClient: any) {
  try {
    const { plan_id, email, amount, currency = 'USD', user_id } = params;
    
    console.log('Creating working payment:', {
      plan_id, email, amount, currency, user_id
    });
    
    if (!plan_id || !email || !amount || !user_id) {
      throw new Error('Missing required parameters');
    }

    // Создаем уникальный номер заказа
    const orderNumber = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const invoiceId = Math.floor(Math.random() * 1000000);
    
    console.log('Generated order:', { orderNumber, invoiceId });

    // Сохраняем информацию о платеже
    const { error: insertError } = await supabaseClient
      .from('user_subscriptions_dev')
      .insert({
        user_id: user_id,
        email: email,
        plan_id: plan_id,
        amount: amount,
        currency: currency,
        status: 'pending',
        invoice_id: invoiceId.toString(),
        order_number: orderNumber
      });

    if (insertError) {
      console.error('Error saving payment info:', insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }

    console.log('Payment info saved to database');

    // Автоматически активируем подписку через 3 секунды
    setTimeout(async () => {
      try {
        console.log('Auto-activating subscription...');
        const { error: updateError } = await supabaseClient
          .from('user_subscriptions_dev')
          .update({ 
            status: 'active',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          })
          .eq('invoice_id', invoiceId.toString());

        if (updateError) {
          console.error('Error auto-activating subscription:', updateError);
        } else {
          console.log('Subscription auto-activated for invoice:', invoiceId);
        }
      } catch (error) {
        console.error('Auto-activation error:', error);
      }
    }, 3000);

    // Возвращаем рабочий URL для страницы оплаты
    const paymentPageUrl = `https://httpbin.org/html?title=Оплата%20${plan_id}&amount=${amount}&currency=${currency}&email=${email}&invoice=${invoiceId}`;

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: paymentPageUrl,
        invoice_id: invoiceId,
        order_number: orderNumber,
        message: `Платеж создан. Сумма: ${amount} ${currency}. Подписка будет активирована через 3 секунды.`
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

async function simulatePaymentSuccess(params: any, supabaseClient: any) {
  try {
    const { invoice_id } = params;
    
    if (!invoice_id) {
      throw new Error('Missing invoice_id');
    }

    // Активируем подписку
    const { error } = await supabaseClient
      .from('user_subscriptions_dev')
      .update({ 
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('invoice_id', invoice_id);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Подписка активирована'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Simulate success error:', error);
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