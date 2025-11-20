import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CreditCard, Check, Clock, ExternalLink } from 'lucide-react';

interface PaymentPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration: number;
  features: string[];
}

const plans: PaymentPlan[] = [
  {
    id: 'starter_weekly',
    name: 'Стартер',
    price: 9.99,
    currency: 'USD',
    duration: 7,
    features: [
      '✅ Автоматическая торговля',
      '✅ Настройка TP/SL',
      '✅ Поддержка Bybit',
      '✅ Telegram уведомления',
      '⏰ 7 дней доступа'
    ]
  },
  {
    id: 'pro_monthly',
    name: 'Про',
    price: 29.99,
    currency: 'USD',
    duration: 30,
    features: [
      '✅ Все функции Стартер',
      '✅ Поддержка всех бирж',
      '✅ Расширенная аналитика',
      '✅ Приоритетная поддержка',
      '⏰ 30 дней доступа'
    ]
  },
  {
    id: 'premium_yearly',
    name: 'Премиум',
    price: 299.99,
    currency: 'USD',
    duration: 365,
    features: [
      '✅ Все функции Про',
      '✅ Персональные настройки',
      '✅ VIP поддержка 24/7',
      '✅ Эксклюзивные стратегии',
      '⏰ 365 дней доступа',
      '🎁 Скидка 50%!'
    ]
  }
];

interface RealPaymentProps {
  user: any;
  onPaymentSuccess: () => void;
}

export default function RealPayment({ user, onPaymentSuccess }: RealPaymentProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const { toast } = useToast();

  const handlePayment = async (plan: PaymentPlan) => {
    if (!user?.id) {
      toast({
        title: "Ошибка",
        description: "Необходимо войти в систему",
        variant: "destructive",
      });
      return;
    }

    setLoading(plan.id);
    setProcessingPayment(true);

    try {
      console.log('🔥 Creating real payment for plan:', plan.name, plan.price);

      // Вызываем Edge Function для создания реального платежа CoinGate
      const { data, error } = await supabase.functions.invoke('coingate_real_payments_2025_11_06_19_47', {
        body: {
          user_id: user.id,
          user_email: user.email,
          plan_id: plan.id,
          plan_name: plan.name,
          amount: plan.price,
          currency: plan.currency,
          duration_days: plan.duration
        }
      });

      console.log('🔥 Payment response:', { data, error });

      if (error) {
        throw new Error(`Payment error: ${error.message}`);
      }

      if (!data?.success) {
        throw new Error(`Payment failed: ${data?.error || 'Unknown error'}`);
      }

      // Если есть payment_url, открываем его
      if (data.payment_url) {
        console.log('🔥 Opening payment URL:', data.payment_url);
        
        // Открываем в новом окне
        const paymentWindow = window.open(data.payment_url, '_blank', 'width=800,height=600');
        
        if (!paymentWindow) {
          // Если popup заблокирован, перенаправляем в том же окне
          console.log('🔥 Popup blocked, redirecting in same window');
          window.location.href = data.payment_url;
          return;
        }

        toast({
          title: "🔥 Переход к оплате",
          description: `Откроется страница CoinGate для оплаты $${plan.price}. После оплаты вернитесь на эту страницу.`,
        });

        // Проверяем статус оплаты каждые 5 секунд
        const checkPaymentStatus = setInterval(async () => {
          try {
            const { data: statusData } = await supabase
              .from('user_subscriptions_dev')
              .select('status')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .gte('expires_at', new Date().toISOString())
              .single();

            if (statusData) {
              clearInterval(checkPaymentStatus);
              toast({
                title: "✅ Оплата успешна!",
                description: "Подписка активирована. Перезагружаем страницу...",
              });
              setTimeout(() => {
                onPaymentSuccess();
              }, 2000);
            }
          } catch (error) {
            // Продолжаем проверку
          }
        }, 5000);

        // Останавливаем проверку через 10 минут
        setTimeout(() => {
          clearInterval(checkPaymentStatus);
        }, 600000);

      } else {
        throw new Error('Payment URL not received');
      }

    } catch (error: any) {
      console.error('🔥 Payment error:', error);
      toast({
        title: "❌ Ошибка оплаты",
        description: error.message || "Не удалось создать платеж. Попробуйте позже.",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
      setProcessingPayment(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4">🚀 Выберите тарифный план</h1>
        <p className="text-gray-600 mb-2">
          Активируйте подписку для доступа к торговому боту
        </p>
        <Badge variant="outline" className="mb-4">
          💳 Оплата криптовалютой через CoinGate
        </Badge>
      </div>

      {processingPayment && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-blue-600 animate-spin" />
              <div>
                <p className="font-medium text-blue-800">Обработка платежа...</p>
                <p className="text-sm text-blue-600">
                  Не закрывайте эту страницу. После оплаты подписка активируется автоматически.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card 
            key={plan.id} 
            className={`relative transition-all duration-200 hover:shadow-lg ${
              plan.id === 'pro_monthly' ? 'border-blue-500 shadow-md' : ''
            }`}
          >
            {plan.id === 'pro_monthly' && (
              <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-blue-500">
                🔥 Популярный
              </Badge>
            )}
            
            <CardHeader className="text-center">
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <CardDescription>
                <div className="text-3xl font-bold text-black mb-2 bg-white px-3 py-2 rounded-lg border-2 border-gray-300">
                  ${plan.price}
                </div>
                <div className="text-sm text-gray-600">
                  {plan.duration === 7 ? 'на неделю' : 
                   plan.duration === 30 ? 'на месяц' : 'на год'}
                </div>
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <ul className="space-y-2 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="text-sm flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">
                      {feature.includes('🎁') ? '🎁' : '✅'}
                    </span>
                    <span>{feature.replace(/^[✅⏰🎁]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
              
              <Button
                onClick={() => handlePayment(plan)}
                disabled={loading === plan.id || processingPayment}
                className="w-full"
                variant={plan.id === 'pro_monthly' ? 'default' : 'outline'}
              >
                {loading === plan.id ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Создание платежа...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    💳 Оплатить ${plan.price}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 text-center">
        <div className="bg-gray-50 rounded-lg p-4 max-w-2xl mx-auto">
          <h3 className="font-semibold mb-2">🔒 Безопасная оплата</h3>
          <p className="text-sm text-gray-600 mb-2">
            Оплата производится через CoinGate - надежный процессор криптоплатежей.
            Поддерживаются Bitcoin, Ethereum, USDT и другие криптовалюты.
          </p>
          <div className="flex justify-center gap-4 text-xs text-gray-500">
            <span>🔐 SSL шифрование</span>
            <span>💎 Мгновенная активация</span>
            <span>🔄 Автоматическое продление</span>
          </div>
        </div>
      </div>
    </div>
  );
}