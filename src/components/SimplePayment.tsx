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
    name: 'Стартер (1 неделя)',
    price: 9.99,
    currency: 'USD',
    duration: 7,
    features: ['Базовая торговля', 'API интеграция', 'Поддержка 24/7']
  },
  {
    id: 'pro_monthly',
    name: 'Про (1 месяц)',
    price: 29.99,
    currency: 'USD',
    duration: 30,
    features: ['Все функции Стартер', 'Продвинутые стратегии', 'Приоритетная поддержка']
  },
  {
    id: 'premium_yearly',
    name: 'Премиум (1 год)',
    price: 299.99,
    currency: 'USD',
    duration: 365,
    features: ['Все функции Про', 'Персональный менеджер', 'Эксклюзивные стратегии']
  }
];

interface SimplePaymentProps {
  user: any;
  onPaymentSuccess?: () => void;
}

const SimplePayment: React.FC<SimplePaymentProps> = ({ user, onPaymentSuccess }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const handlePayment = async (plan: PaymentPlan) => {
    if (!user?.id) {
      toast({
        title: "❌ Ошибка",
        description: "Войдите в систему для оплаты",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(plan.id);
      console.log('💳 Starting simple payment for plan:', plan);

      const response = await supabase.functions.invoke('payment_system_fixed_2025_11_06_19_47', {
        body: {
          user_id: user.id,
          plan_id: plan.id,
          plan_name: plan.name,
          price: plan.price,
          duration: plan.duration
        }
      });

      if (response.error) {
        throw new Error(`Payment error: ${response.error.message}`);
      }

      // Открываем страницу оплаты в новом окне
      const paymentWindow = window.open('', '_blank', 'width=600,height=700,scrollbars=yes');
      
      if (paymentWindow) {
        paymentWindow.document.write(response.data);
        paymentWindow.document.close();

        // Слушаем сообщения от окна оплаты
        const messageHandler = (event: MessageEvent) => {
          if (event.data.type === 'payment_success') {
            console.log('💳 Payment success received:', event.data);
            
            toast({
              title: "✅ Оплата успешна!",
              description: `Подписка "${plan.name}" активирована`,
            });

            if (onPaymentSuccess) {
              onPaymentSuccess();
            }

            window.removeEventListener('message', messageHandler);
          }
        };

        window.addEventListener('message', messageHandler);

        // Проверяем закрытие окна
        const checkClosed = setInterval(() => {
          if (paymentWindow.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageHandler);
            setLoading(null);
          }
        }, 1000);
      } else {
        throw new Error('Не удалось открыть окно оплаты. Разрешите всплывающие окна.');
      }

    } catch (error: any) {
      console.error('💳 Payment error:', error);
      toast({
        title: "❌ Ошибка оплаты",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            💳 Выберите тарифный план
          </CardTitle>
          <CardDescription>
            Активируйте подписку для доступа к торговому боту
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.id} className="relative">
            <CardHeader>
              <CardTitle className="text-lg">{plan.name}</CardTitle>
              <div className="text-3xl font-bold">
                ${plan.price}
                <span className="text-sm font-normal text-gray-500">/{plan.duration} дн.</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                <span>Действует {plan.duration} дней</span>
              </div>

              <Button 
                onClick={() => handlePayment(plan)}
                disabled={loading === plan.id}
                className="w-full"
              >
                {loading === plan.id ? (
                  <>⏳ Обработка...</>
                ) : (
                  <>💳 Оплатить ${plan.price}</>
                )}
              </Button>
            </CardContent>

            {plan.id === 'pro_monthly' && (
              <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-blue-500">
                Популярный
              </Badge>
            )}
          </Card>
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="text-blue-500 text-2xl">ℹ️</div>
            <div>
              <h3 className="font-semibold text-blue-900">Информация об оплате</h3>
              <ul className="text-sm text-blue-800 mt-2 space-y-1">
                <li>• Мгновенная активация подписки</li>
                <li>• Безопасная обработка платежей</li>
                <li>• Автоматическое продление (можно отключить)</li>
                <li>• Возврат средств в течение 7 дней</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SimplePayment;