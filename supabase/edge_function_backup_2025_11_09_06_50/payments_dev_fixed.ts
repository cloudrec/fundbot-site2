import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  console.log('=== DEV PAYMENT SYSTEM START ===');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();
    console.log('DEV Payment action:', action, 'params:', params);

    switch (action) {
      case 'create_payment':
        return await createDevPayment(params, supabaseClient);
      
      case 'simulate_success':
        return await simulatePaymentSuccess(params, supabaseClient);
      
      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('DEV Payment Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        dev_mode: true
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function createDevPayment(params: any, supabaseClient: any) {
  try {
    const { plan_id, email, amount, currency = 'USD', user_id } = params;
    
    console.log('DEV: Creating payment simulation:', {
      plan_id, email, amount, currency, user_id
    });
    
    if (!plan_id || !email || !amount || !user_id) {
      throw new Error('Missing required parameters: plan_id, email, amount, user_id');
    }

    // Создаем уникальный номер заказа
    const orderNumber = `DEV_ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const invoiceId = Math.floor(Math.random() * 1000000);
    
    console.log('DEV: Generated order:', { orderNumber, invoiceId });

    // Сохраняем информацию о платеже в DEV таблице
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
      console.error('DEV: Error saving payment info:', insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }

    console.log('DEV: Payment info saved to database');

    // В DEV режиме автоматически активируем подписку через 2 секунды
    setTimeout(async () => {
      try {
        console.log('DEV: Auto-activating subscription...');
        const { error: updateError } = await supabaseClient
          .from('user_subscriptions_dev')
          .update({ 
            status: 'active',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 дней
          })
          .eq('invoice_id', invoiceId.toString());

        if (updateError) {
          console.error('DEV: Error auto-activating subscription:', updateError);
        } else {
          console.log('DEV: Subscription auto-activated for invoice:', invoiceId);
        }
      } catch (error) {
        console.error('DEV: Auto-activation error:', error);
      }
    }, 2000);

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: `data:text/html,<html><body style="font-family:Arial;padding:20px;text-align:center;background:#f0f8ff;"><h2 style="color:#2563eb;">🧪 DEV Режим - Симуляция Оплаты</h2><p>Сумма: <strong>${amount} ${currency}</strong></p><p>План: <strong>${plan_id}</strong></p><p>Email: <strong>${email}</strong></p><div style="margin:20px;padding:20px;background:white;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);"><h3 style="color:#16a34a;">✅ Оплата Симулирована</h3><p>Подписка будет автоматически активирована через 2 секунды</p><button onclick="window.close()" style="background:#2563eb;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;">Закрыть</button></div></body></html>`,
        invoice_id: invoiceId,
        order_number: orderNumber,
        dev_mode: true,
        message: 'DEV: Симуляция платежа создана. Подписка будет активирована автоматически.'
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

async function simulatePaymentSuccess(params: any, supabaseClient: any) {
  try {
    const { invoice_id, user_id } = params;
    
    if (!invoice_id) {
      throw new Error('Missing invoice_id');
    }

    console.log('DEV: Simulating payment success for invoice:', invoice_id);

    // Активируем подписку
    const { error: updateError } = await supabaseClient
      .from('user_subscriptions_dev')
      .update({ 
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 дней
      })
      .eq('invoice_id', invoice_id.toString());

    if (updateError) {
      console.error('DEV: Error activating subscription:', updateError);
      throw new Error(`Activation error: ${updateError.message}`);
    }

    console.log('DEV: Subscription activated for invoice:', invoice_id);

    return new Response(
      JSON.stringify({
        success: true,
        status: 'active',
        dev_mode: true,
        message: 'DEV: Подписка успешно активирована'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('DEV: Simulate success error:', error);
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