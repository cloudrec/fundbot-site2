import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CreditCard, Shield, Zap, CheckCircle } from 'lucide-react';

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

export default function PaymentComponentSimple() {
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

  const activateSubscription = async (plan: PaymentPlan) => {
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

      // ПРОСТОЕ РЕШЕНИЕ: активируем подписку напрямую
      const { error } = await supabase
        .from('user_subscriptions_dev')
        .insert({
          user_id: user.id,
          email: user.email,
          plan_id: plan.id,
          amount: plan.price,
          currency: plan.currency,
          status: 'active',
          expires_at: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000).toISOString(),
          invoice_id: `DEMO_${Date.now()}`,
          order_number: `ORDER_${Date.now()}`
        });

      if (error) {
        throw new Error(error.message);
      }

      toast({
        title: "🎉 Подписка активирована!",
        description: `План "${plan.name}" активирован на ${plan.duration} дней. Сумма: $${plan.price}`,
      });

      // Обновляем список подписок
      loadSubscriptions();

    } catch (error: any) {
      console.error('Activation error:', error);
      toast({
        title: "Ошибка активации",
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
            Тарифные планы
          </CardTitle>
          <CardDescription>
            Выберите подходящий план для торговли
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
                  onClick={() => activateSubscription(plan)}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? 'Активация...' : 'Активировать'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          🧪 <strong>ДЕМО РЕЖИМ:</strong> Подписки активируются мгновенно без реальной оплаты. 
          В продакшене здесь будет интеграция с реальной платежной системой.
        </AlertDescription>
      </Alert>
    </div>
  );
}