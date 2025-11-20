import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CreditCard, Shield, Zap, CheckCircle, ExternalLink } from 'lucide-react';

interface PaymentPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration: number;
  features: string[];
}

const paymentPlans: PaymentPlan[] = [
  {
    id: 'starter_weekly',
    name: 'Стартер (1 неделя)',
    price: 9.99,
    currency: 'USD',
    duration: 7,
    features: ['Доступ ко всем биржам', 'Автоматическая торговля', 'Telegram уведомления']
  },
  {
    id: 'basic_monthly',
    name: 'Базовый (1 месяц)',
    price: 29.99,
    currency: 'USD',
    duration: 30,
    features: ['Все функции стартера', 'Приоритетная поддержка', 'Расширенная аналитика']
  },
  {
    id: 'pro_quarterly',
    name: 'Профессиональный (3 месяца)',
    price: 79.99,
    currency: 'USD',
    duration: 90,
    features: ['Все функции базового', 'Скидка 11%', 'Персональные настройки']
  }
];

export default function RealPaymentComponent() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    checkUser();
    loadSubscriptions();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  };

  const loadSubscriptions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_subscriptions_dev')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading subscriptions:', error);
      } else {
        setSubscriptions(data || []);
      }
    } catch (error) {
      console.error('Load subscriptions error:', error);
    }
  };

  const createRealPayment = async (plan: PaymentPlan) => {
    if (!user) {
      toast({
        title: "Ошибка",
        description: "Необходимо войти в систему",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      console.log('🔥 Creating REAL CoinGate payment for plan:', plan);

      const { data, error } = await supabase.functions.invoke('coingate_real_payments_2025_11_06_19_47', {
        body: {
          action: 'create_payment',
          plan_id: plan.id,
          user_id: user.id,
          amount: plan.price,
          currency: plan.currency,
          email: user.email
        }
      });

      console.log('🔥 CoinGate response:', data, 'error:', error);

      if (error) {
        throw new Error(`Edge Function error: ${error.message}`);
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'Ошибка создания платежа');
      }

      toast({
        title: "💳 Платеж создан в CoinGate!",
        description: "Переходим на страницу оплаты криптовалютой...",
      });

      // Открываем РЕАЛЬНУЮ страницу оплаты CoinGate
      if (data.payment_url) {
        console.log('🔥 Opening REAL CoinGate payment page:', data.payment_url);
        
        const paymentWindow = window.open(data.payment_url, '_blank', 'width=800,height=700');
        
        if (!paymentWindow) {
          console.error('🔥 Popup blocked! Opening in same window...');
          window.location.href = data.payment_url;
        } else {
          console.log('🔥 CoinGate payment window opened successfully!');
          
          // Проверяем статус платежа каждые 10 секунд
          const checkInterval = setInterval(async () => {
            await loadSubscriptions();
            
            // Если появилась новая активная подписка, закрываем интервал
            const { data: newSubs } = await supabase
              .from('user_subscriptions_dev')
              .select('*')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .eq('plan_id', plan.id)
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (newSubs && newSubs.length > 0) {
              clearInterval(checkInterval);
              toast({
                title: "🎉 Оплата успешна!",
                description: `Подписка "${plan.name}" активирована!`,
              });
              loadSubscriptions();
            }
          }, 10000);
          
          // Останавливаем проверку через 10 минут
          setTimeout(() => {
            clearInterval(checkInterval);
          }, 600000);
        }
      } else {
        throw new Error('Не получен URL для оплаты');
      }

    } catch (error: any) {
      console.error('🔥 Real payment error:', error);
      toast({
        title: "Ошибка создания платежа",
        description: error.message || 'Неизвестная ошибка',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Подписка</CardTitle>
          <CardDescription>Войдите в систему для управления подпиской</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Активные подписки */}
      {subscriptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Активные подписки
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div>
                    <div className="font-semibold text-green-800">{sub.plan_id}</div>
                    <div className="text-sm text-green-600">
                      Истекает: {new Date(sub.expires_at).toLocaleDateString('ru-RU')}
                    </div>
                    <div className="text-xs text-gray-500">
                      Заказ: {sub.order_number}
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    Активна
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Тарифные планы */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Оплата криптовалютой
          </CardTitle>
          <CardDescription>
            Выберите план и оплатите Bitcoin, Ethereum или другой криптовалютой
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {paymentPlans.map((plan) => (
              <div key={plan.id} className="border rounded-lg p-4 space-y-4">
                <div className="text-center">
                  <h3 className="font-semibold text-lg">{plan.name}</h3>
                  <div className="text-2xl font-bold text-blue-600">
                    ${plan.price}
                  </div>
                  <div className="text-sm text-gray-600">
                    {plan.duration} дней
                  </div>
                </div>
                
                <div className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {feature}
                    </div>
                  ))}
                </div>
                
                <Button 
                  onClick={() => createRealPayment(plan)}
                  disabled={loading}
                  className="w-full flex items-center gap-2"
                >
                  {loading ? (
                    'Создание платежа...'
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4" />
                      Оплатить криптовалютой
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          🔒 <strong>РЕАЛЬНАЯ ОПЛАТА:</strong> Платежи обрабатываются через CoinGate. 
          Поддерживаются Bitcoin, Ethereum, Litecoin и другие криптовалюты. 
          Подписка активируется автоматически после подтверждения платежа.
        </AlertDescription>
      </Alert>
    </div>
  );
}