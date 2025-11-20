import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestBody = await req.json();
    const { user_id, plan_id, plan_name, price, duration } = requestBody;
    
    console.log('💳 Payment request received:', requestBody);

    if (!user_id) {
      throw new Error('Отсутствует user_id');
    }

    if (!plan_id) {
      throw new Error('Отсутствует plan_id');
    }

    // Создаем подписку сразу как активную
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (duration || 7));

    console.log('💳 Creating subscription for user:', user_id);

    const subscriptionData = {
      user_id: user_id,
      plan_id: plan_id,
      status: 'active',
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('💳 Subscription data:', subscriptionData);

    const { data: subscription, error: subError } = await supabaseClient
      .from('user_subscriptions_dev')
      .insert(subscriptionData)
      .select()
      .single();

    if (subError) {
      console.error('💳 Subscription creation error:', subError);
      
      // Если ошибка дублирования, обновляем существующую
      if (subError.code === '23505') {
        console.log('💳 Updating existing subscription...');
        
        const { data: updatedSub, error: updateError } = await supabaseClient
          .from('user_subscriptions_dev')
          .update({
            status: 'active',
            expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user_id)
          .eq('plan_id', plan_id)
          .select()
          .single();

        if (updateError) {
          throw new Error(`Ошибка обновления подписки: ${updateError.message}`);
        }

        console.log('💳 Subscription updated:', updatedSub);
      } else {
        throw new Error(`Ошибка создания подписки: ${subError.message}`);
      }
    } else {
      console.log('💳 Subscription created successfully:', subscription);
    }

    // Возвращаем HTML страницу с подтверждением
    const paymentHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Оплата успешна</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .container {
                background: white;
                border-radius: 16px;
                padding: 40px;
                max-width: 500px;
                width: 100%;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                text-align: center;
            }
            .success-icon {
                font-size: 64px;
                margin-bottom: 20px;
                animation: bounce 1s ease-in-out;
            }
            @keyframes bounce {
                0%, 20%, 60%, 100% { transform: translateY(0); }
                40% { transform: translateY(-10px); }
                80% { transform: translateY(-5px); }
            }
            .title {
                color: #28a745;
                font-size: 28px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .subtitle {
                color: #666;
                font-size: 18px;
                margin-bottom: 30px;
            }
            .plan-info {
                background: #f8f9fa;
                border-radius: 12px;
                padding: 24px;
                margin: 24px 0;
                border-left: 4px solid #28a745;
            }
            .plan-name {
                font-size: 20px;
                font-weight: bold;
                color: #333;
                margin-bottom: 12px;
            }
            .plan-details {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                text-align: left;
            }
            .detail-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #eee;
            }
            .detail-label {
                color: #666;
                font-weight: 500;
            }
            .detail-value {
                color: #333;
                font-weight: bold;
            }
            .button {
                background: linear-gradient(135deg, #28a745, #20c997);
                color: white;
                border: none;
                padding: 16px 32px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
                margin-top: 24px;
                width: 100%;
            }
            .button:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 16px rgba(40, 167, 69, 0.3);
            }
            .countdown {
                color: #666;
                font-size: 14px;
                margin-top: 16px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success-icon">✅</div>
            <div class="title">Оплата успешна!</div>
            <div class="subtitle">Подписка активирована</div>
            
            <div class="plan-info">
                <div class="plan-name">${plan_name || plan_id}</div>
                <div class="plan-details">
                    <div class="detail-item">
                        <span class="detail-label">💰 Цена:</span>
                        <span class="detail-value">$${price || '9.99'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">⏰ Срок:</span>
                        <span class="detail-value">${duration || 7} дней</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">📅 До:</span>
                        <span class="detail-value">${expiresAt.toLocaleDateString('ru-RU')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">🎯 Статус:</span>
                        <span class="detail-value">Активна</span>
                    </div>
                </div>
            </div>
            
            <p style="color: #666; margin: 20px 0;">
                🎉 Поздравляем! Ваша подписка активирована и готова к использованию.
                Теперь у вас есть полный доступ к торговому боту.
            </p>
            
            <button onclick="closeWindow()" class="button">
                🚀 Начать торговлю
            </button>
            
            <div class="countdown">
                Окно автоматически закроется через <span id="timer">5</span> секунд
            </div>
            
            <script>
                let countdown = 5;
                const timer = document.getElementById('timer');
                
                const interval = setInterval(() => {
                    countdown--;
                    timer.textContent = countdown;
                    
                    if (countdown <= 0) {
                        clearInterval(interval);
                        closeWindow();
                    }
                }, 1000);
                
                function closeWindow() {
                    // Уведомляем родительское окно об успешной оплате
                    if (window.opener) {
                        window.opener.postMessage({
                            type: 'payment_success',
                            subscription: {
                                user_id: '${user_id}',
                                plan_id: '${plan_id}',
                                plan_name: '${plan_name}',
                                expires_at: '${expiresAt.toISOString()}'
                            }
                        }, '*');
                    }
                    
                    window.close();
                }
                
                // Закрываем по Escape
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        closeWindow();
                    }
                });
            </script>
        </div>
    </body>
    </html>`;

    return new Response(paymentHtml, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/html; charset=utf-8'
      }
    });

  } catch (error) {
    console.error('💳 Payment processing error:', error);
    
    const errorHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Ошибка оплаты</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .container {
                background: white;
                border-radius: 16px;
                padding: 40px;
                max-width: 500px;
                width: 100%;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                text-align: center;
            }
            .error-icon { font-size: 64px; margin-bottom: 20px; }
            .title { color: #dc3545; font-size: 28px; font-weight: bold; margin-bottom: 10px; }
            .message { color: #666; font-size: 16px; margin: 20px 0; }
            .button {
                background: #dc3545;
                color: white;
                border: none;
                padding: 16px 32px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                margin-top: 20px;
                width: 100%;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="error-icon">❌</div>
            <div class="title">Ошибка оплаты</div>
            <div class="message">${error.message}</div>
            <button onclick="window.close()" class="button">
                Закрыть окно
            </button>
        </div>
    </body>
    </html>`;

    return new Response(errorHtml, {
      status: 200, // Возвращаем 200 чтобы HTML отобразился
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  }
});