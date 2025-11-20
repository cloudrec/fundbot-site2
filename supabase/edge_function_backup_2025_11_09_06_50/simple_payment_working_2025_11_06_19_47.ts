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

    const { user_id, plan_id, plan_name, price, duration } = await req.json();
    
    console.log('💳 Simple payment request:', { user_id, plan_id, plan_name, price, duration });

    if (!user_id || !plan_id) {
      throw new Error('Отсутствуют обязательные параметры: user_id, plan_id');
    }

    // Создаем подписку сразу как активную (для демо)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (duration || 7));

    const { data: subscription, error: subError } = await supabaseClient
      .from('user_subscriptions_dev')
      .upsert({
        user_id: user_id,
        plan_id: plan_id,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,plan_id'
      })
      .select()
      .single();

    if (subError) {
      console.error('💳 Subscription error:', subError);
      throw new Error(`Ошибка создания подписки: ${subError.message}`);
    }

    console.log('💳 Subscription created:', subscription);

    // Возвращаем простую HTML страницу с подтверждением
    const paymentHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Оплата успешна</title>
        <meta charset="utf-8">
        <style>
            body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 50px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            .container {
                background: white;
                color: #333;
                padding: 40px;
                border-radius: 10px;
                max-width: 500px;
                margin: 0 auto;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            }
            .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
            .plan { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .button {
                background: #28a745;
                color: white;
                padding: 15px 30px;
                border: none;
                border-radius: 5px;
                font-size: 16px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                margin-top: 20px;
            }
            .button:hover { background: #218838; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success">✅ Оплата успешна!</div>
            <h2>Подписка активирована</h2>
            
            <div class="plan">
                <h3>${plan_name || plan_id}</h3>
                <p><strong>Цена:</strong> $${price || '9.99'}</p>
                <p><strong>Срок:</strong> ${duration || 7} дней</p>
                <p><strong>Действует до:</strong> ${expiresAt.toLocaleDateString('ru-RU')}</p>
            </div>
            
            <p>Ваша подписка активирована и готова к использованию!</p>
            
            <a href="#" onclick="window.close()" class="button">
                Закрыть окно
            </a>
            
            <script>
                // Автоматически закрываем окно через 5 секунд
                setTimeout(() => {
                    window.close();
                }, 5000);
                
                // Уведомляем родительское окно об успешной оплате
                if (window.opener) {
                    window.opener.postMessage({
                        type: 'payment_success',
                        subscription: ${JSON.stringify(subscription)}
                    }, '*');
                }
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
    console.error('💳 Payment error:', error);
    
    const errorHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Ошибка оплаты</title>
        <meta charset="utf-8">
        <style>
            body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 50px;
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                color: white;
            }
            .container {
                background: white;
                color: #333;
                padding: 40px;
                border-radius: 10px;
                max-width: 500px;
                margin: 0 auto;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            }
            .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
            .button {
                background: #dc3545;
                color: white;
                padding: 15px 30px;
                border: none;
                border-radius: 5px;
                font-size: 16px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="error">❌ Ошибка оплаты</div>
            <h2>Не удалось обработать платеж</h2>
            <p>${error.message}</p>
            <a href="#" onclick="window.close()" class="button">
                Закрыть окно
            </a>
        </div>
    </body>
    </html>`;

    return new Response(errorHtml, {
      status: 400,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  }
});