import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  console.log('=== PAYMENT SYSTEM FINAL ===');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  
  // Если это GET запрос на страницу оплаты
  if (req.method === 'GET' && url.pathname === '/payment-page') {
    const params = url.searchParams;
    const amount = params.get('amount') || '0';
    const currency = params.get('currency') || 'USD';
    const plan = params.get('plan') || 'Unknown';
    const email = params.get('email') || 'Unknown';
    const invoice = params.get('invoice') || 'Unknown';
    
    const paymentPageHTML = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Оплата подписки</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .payment-container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        h1 {
            color: #2d3748;
            margin-bottom: 10px;
        }
        .amount {
            font-size: 32px;
            font-weight: bold;
            color: #16a34a;
            margin: 20px 0;
        }
        .details {
            background: #f7fafc;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            text-align: left;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            padding: 5px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .status {
            background: #dcfce7;
            color: #166534;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            font-weight: bold;
        }
        .close-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 20px;
        }
        .close-btn:hover {
            background: #2563eb;
        }
        .timer {
            color: #6b7280;
            font-size: 14px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="payment-container">
        <div class="success-icon">🎉</div>
        <h1>Оплата успешно создана!</h1>
        <div class="amount">${amount} ${currency}</div>
        
        <div class="details">
            <div class="detail-row">
                <span><strong>План:</strong></span>
                <span>${plan}</span>
            </div>
            <div class="detail-row">
                <span><strong>Email:</strong></span>
                <span>${email}</span>
            </div>
            <div class="detail-row">
                <span><strong>Номер заказа:</strong></span>
                <span>#${invoice}</span>
            </div>
        </div>
        
        <div class="status">
            ✅ Подписка будет активирована автоматически через <span id="countdown">3</span> секунд
        </div>
        
        <button class="close-btn" onclick="window.close()">Закрыть окно</button>
        
        <div class="timer">
            Это демо-версия. В реальной системе здесь будет форма оплаты криптовалютой.
        </div>
    </div>

    <script>
        let countdown = 3;
        const countdownElement = document.getElementById('countdown');
        
        const timer = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(timer);
                countdownElement.textContent = '0';
                document.querySelector('.status').innerHTML = '🎉 Подписка активирована! Можете закрыть это окно.';
                
                // Попытка закрыть окно автоматически
                setTimeout(() => {
                    try {
                        window.close();
                    } catch (e) {
                        console.log('Cannot close window automatically');
                    }
                }, 2000);
            }
        }, 1000);
    </script>
</body>
</html>`;

    return new Response(paymentPageHTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // POST запросы для создания платежа
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();
    console.log('Payment action:', action, 'params:', params);

    switch (action) {
      case 'create_payment':
        return await createFinalPayment(params, supabaseClient, req);
      
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

async function createFinalPayment(params: any, supabaseClient: any, req: Request) {
  try {
    const { plan_id, email, amount, currency = 'USD', user_id } = params;
    
    console.log('Creating final payment:', {
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

    // Создаем URL для нашей встроенной страницы оплаты
    const baseUrl = new URL(req.url).origin;
    const paymentPageUrl = `${baseUrl}/payment-page?amount=${amount}&currency=${currency}&plan=${plan_id}&email=${encodeURIComponent(email)}&invoice=${invoiceId}`;

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