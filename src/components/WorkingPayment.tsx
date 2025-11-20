import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CreditCard, Check, Clock } from 'lucide-react';

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

interface WorkingPaymentProps {
  user: any;
  onPaymentSuccess: () => void;
}

export default function WorkingPayment({ user, onPaymentSuccess }: WorkingPaymentProps) {
  const [loading, setLoading] = useState<string | null>(null);
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

    try {
      console.log('💳 Activating subscription for plan:', plan.name, plan.price);

      // Создаем подписку напрямую в базе данных
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + plan.duration);

      // Просто создаем подписку - уникальный ключ обработает дубликаты
      console.log('💳 Creating subscription for user:', user.id, 'plan:', plan.name);

      const { data, error } = await supabase
        .from('user_subscriptions_dev')
        .insert({
          user_id: user.id,
          email: user.email,
          plan_id: plan.id,
          plan_name: plan.name,
          amount: plan.price,
          currency: plan.currency,
          status: 'active',
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        // Если ошибка duplicate key, пробуем обновить
        if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
          console.log('💳 Duplicate key detected, trying update instead...');
          const { data: updateData, error: updateError } = await supabase
            .from('user_subscriptions_dev')
            .update({
              plan_id: plan.id,
              plan_name: plan.name,
              amount: plan.price,
              currency: plan.currency,
              status: 'active',
              expires_at: expiresAt.toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);
          
          if (updateError) {
            throw new Error(`Update error: ${updateError.message}`);
          }
          console.log('💳 Subscription updated successfully');
        } else {
          throw new Error(`Database error: ${error.message}`);
        }
      }

      console.log('💳 Subscription created:', data);

      toast({
        title: "✅ Подписка активирована!",
        description: `Тариф "${plan.name}" активирован на ${plan.duration} дней. Перезагружаем страницу...`,
      });

      // Перезагружаем страницу через 2 секунды
      setTimeout(() => {
        onPaymentSuccess();
      }, 2000);

    } catch (error: any) {
      console.error('💳 Payment error:', error);
      toast({
        title: "❌ Ошибка активации",
        description: error.message || "Не удалось активировать подписку. Попробуйте позже.",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4 text-black">🚀 Выберите тарифный план</h1>
        <p className="text-gray-700 mb-2 font-medium">
          Активируйте подписку для доступа к торговому боту
        </p>
        <Badge variant="outline" className="mb-4 bg-green-100 text-green-800 border-green-300">
          💳 Мгновенная активация (DEV режим)
        </Badge>
      </div>

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
              <CardTitle className="text-xl text-black">{plan.name}</CardTitle>
              <CardDescription>
                <div className="text-4xl font-bold text-black mb-2 bg-yellow-100 px-4 py-3 rounded-lg border-2 border-yellow-400 shadow-md">
                  ${plan.price}
                </div>
                <div className="text-sm text-gray-700 font-semibold">
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
                    <span className="text-gray-700">{feature.replace(/^[✅⏰🎁]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
              
              <Button
                onClick={() => handlePayment(plan)}
                disabled={loading === plan.id}
                className="w-full text-lg py-3"
                variant={plan.id === 'pro_monthly' ? 'default' : 'outline'}
              >
                {loading === plan.id ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Активация...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    💳 Активировать ${plan.price}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 text-center">
        <div className="bg-blue-50 rounded-lg p-4 max-w-2xl mx-auto border border-blue-200">
          <h3 className="font-semibold mb-2 text-blue-800">🔧 DEV Режим</h3>
          <p className="text-sm text-blue-700 mb-2">
            В режиме разработки подписка активируется мгновенно без реальной оплаты.
            В продакшене будет интегрирована реальная платежная система.
          </p>
          <div className="flex justify-center gap-4 text-xs text-blue-600">
            <span>⚡ Мгновенная активация</span>
            <span>🔄 Автоматическое обновление</span>
            <span>🛡️ Безопасное тестирование</span>
          </div>
        </div>
      </div>
    </div>
  );
}