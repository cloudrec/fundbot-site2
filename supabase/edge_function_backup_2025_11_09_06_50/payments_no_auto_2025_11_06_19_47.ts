import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  console.log('=== PAYMENT SYSTEM FIXED ===');
  
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
        return await createPaymentOnly(params, supabaseClient);
      
      case 'confirm_payment':
        return await confirmPayment(params, supabaseClient);
      
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

async function createPaymentOnly(params: any, supabaseClient: any) {
  try {
    const { plan_id, email, amount, currency = 'USD', user_id } = params;
    
    console.log('Creating payment (NO AUTO-ACTIVATION):', {
      plan_id, email, amount, currency, user_id
    });
    
    if (!plan_id || !email || !amount || !user_id) {
      throw new Error('Missing required parameters');
    }

    // Создаем уникальный номер заказа
    const orderNumber = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const invoiceId = Math.floor(Math.random() * 1000000);
    
    console.log('Generated order:', { orderNumber, invoiceId });

    // Сохраняем информацию о платеже БЕЗ автоматической активации
    const { error: insertError } = await supabaseClient
      .from('user_subscriptions_dev')
      .insert({
        user_id: user_id,
        email: email,
        plan_id: plan_id,
        amount: amount,
        currency: currency,
        status: 'pending', // Остается pending до ручного подтверждения
        invoice_id: invoiceId.toString(),
        order_number: orderNumber
      });

    if (insertError) {
      console.error('Error saving payment info:', insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }

    console.log('Payment info saved as PENDING');

    // Создаем простую страницу оплаты
    const paymentPageHTML = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Оплата подписки</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: #f0f8ff;
            margin: 0;
            padding: 20px;
            text-align: center;
        }
        .container {
            background: white;
            border-radius: 10px;
            padding: 30px;
            max-width: 400px;
            margin: 50px auto;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .amount {
            font-size: 24px;
            color: #2563eb;
            font-weight: bold;
            margin: 20px 0;
        }
        .btn {
            background: #16a34a;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            margin: 10px;
        }
        .btn:hover {
            background: #15803d;
        }
        .close-btn {
            background: #6b7280;
        }
        .close-btn:hover {
            background: #4b5563;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>💳 Оплата подписки</h2>
        <div class="amount">${amount} ${currency}</div>
        <p><strong>План:</strong> ${plan_id}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Заказ:</strong> #${invoiceId}</p>
        
        <p>🧪 <strong>ДЕМО РЕЖИМ</strong></p>
        <p>В реальной системе здесь будет форма оплаты криптовалютой</p>
        
        <button class="btn" onclick="simulatePayment()">✅ Симулировать оплату</button>
        <button class="btn close-btn" onclick="window.close()">❌ Отмена</button>
        
        <div id="status" style="margin-top: 20px;"></div>
    </div>

    <script>
        async function simulatePayment() {
            document.getElementById('status').innerHTML = '⏳ Обрабатываем платеж...';
            
            try {
                const response = await fetch('${req.url}', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'confirm_payment',
                        invoice_id: '${invoiceId}'
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    document.getElementById('status').innerHTML = '🎉 Платеж успешен! Подписка активирована!';
                    setTimeout(() => window.close(), 2000);
                } else {
                    document.getElementById('status').innerHTML = '❌ Ошибка: ' + result.error;
                }
            } catch (error) {
                document.getElementById('status').innerHTML = '❌ Ошибка сети: ' + error.message;
            }
        }
    </script>
</body>
</html>`;

    // Возвращаем HTML страницу напрямую
    return new Response(paymentPageHTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

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

async function confirmPayment(params: any, supabaseClient: any) {
  try {
    const { invoice_id } = params;
    
    if (!invoice_id) {
      throw new Error('Missing invoice_id');
    }

    console.log('Confirming payment for invoice:', invoice_id);

    // Активируем подписку ТОЛЬКО после подтверждения
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

    console.log('Subscription activated for invoice:', invoice_id);

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
    console.error('Confirm payment error:', error);
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