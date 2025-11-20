import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  duration: number; // в днях
  features: string[];
}

const paymentPlans: PaymentPlan[] = [
  {
    id: 'basic_monthly',
    name: 'Базовый (1 месяц)',
    price: 29.99,
    currency: 'USD',
    duration: 30,
    features: [
      'Доступ ко всем биржам',
      'Автоматическая торговля',
      'Telegram уведомления',
      'Техническая поддержка'
    ]
  },
  {
    id: 'pro_quarterly',
    name: 'Профессиональный (3 месяца)',
    price: 79.99,
    currency: 'USD',
    duration: 90,
    features: [
      'Все функции базового плана',
      'Приоритетная поддержка',
      'Расширенная аналитика',
      'Скидка 11%'
    ]
  },
  {
    id: 'premium_yearly',
    name: 'Премиум (1 год)',
    price: 299.99,
    currency: 'USD',
    duration: 365,
    features: [
      'Все функции профессионального плана',
      'VIP поддержка',
      'Персональные настройки',
      'Скидка 17%'
    ]
  }
];

interface PaymentComponentProps {
  user: any;
  onPaymentSuccess: () => void;
}

const PaymentComponent: React.FC<PaymentComponentProps> = ({ user, onPaymentSuccess }) => {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [pricingPlans, setPricingPlans] = useState<PaymentPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  
  // Загружаем тарифные планы из базы данных
  useEffect(() => {
    loadPricingPlans();
  }, []);
  
  const loadPricingPlans = async () => {
    try {
      const { data, error } = await supabase
.from('pricing_plans_dev') // DEV таблица
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });
      
      if (error) throw error;
      
      // Преобразуем данные в нужный формат
      const plans: PaymentPlan[] = data.map(plan => ({
        id: plan.plan_id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        duration: plan.duration_days,
        features: Array.isArray(plan.features) ? plan.features : []
      }));
      
      setPricingPlans(plans);
      console.log('Loaded pricing plans:', plans);
    } catch (error: any) {
      console.error('Error loading pricing plans:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить тарифные планы",
        variant: "destructive",
      });
    } finally {
      setPlansLoading(false);
    }
  };

  const createPayment = async (plan: PaymentPlan) => {
    try {
      setLoading(true);
      
      if (!user?.email) {
        toast({
          title: "Ошибка",
          description: "Email пользователя не найден",
          variant: "destructive",
        });
        return;
      }

      const orderNumber = `ORDER_${Date.now()}_${user.id.slice(0, 8)}`;
      
console.log('Creating payment for plan:', plan);
      console.log('User email:', user.email);
      
// DEV: Используем исправленную DEV Edge Function
      console.log('DEV: Creating payment for plan:', plan, 'user:', user.email);
      
      // Новый подход: получаем HTML страницу напрямую
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/payments_no_auto_2025_11_06_19_47`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.supabaseKey}`,
        },
        body: JSON.stringify({
          action: 'create_payment',
          plan_id: plan.id,
          user_id: user.id,
          amount: plan.price,
          currency: plan.currency,
          email: user.email
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('text/html')) {
        // Получили HTML страницу
        const htmlContent = await response.text();
        
        // Создаем Blob URL для HTML
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const paymentUrl = URL.createObjectURL(blob);
        
        console.log('💳 PAYMENT: Opening HTML payment page');
        
        toast({
          title: "Платеж создан",
          description: "Открываем страницу оплаты...",
        });
        
        const paymentWindow = window.open(paymentUrl, '_blank', 'width=600,height=700');
        
        if (!paymentWindow) {
          console.error('💳 PAYMENT: Popup blocked!');
          // Если попап заблокирован, открываем в том же окне
          window.location.href = paymentUrl;
        } else {
          console.log('💳 PAYMENT: Payment window opened successfully!');
        }
        
        return; // Выходим из функции
      }
      
      // Остальная логика для JSON ответов (не используется)

    } catch (error: any) {
      console.error('Payment creation error:', error);
      toast({
        title: "Ошибка создания платежа",
        description: error.message || 'Неизвестная ошибка',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async () => {
    if (!invoiceId) return;

    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('plisio_payments_2025_11_06_12_23', {
        body: {
          action: 'verify_payment',
          invoice_id: invoiceId
        }
      });

      if (error) {
        throw error;
      }

      if (data.is_paid) {
        toast({
          title: "Платеж подтвержден!",
          description: "Ваша подписка активирована",
        });
        onPaymentSuccess();
      } else {
        toast({
          title: "Платеж не подтвержден",
          description: `Статус: ${data.status}`,
          variant: "destructive",
        });
      }

    } catch (error: any) {
      console.error('Payment verification error:', error);
      toast({
        title: "Ошибка проверки платежа",
        description: error.message || 'Неизвестная ошибка',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Выберите план подписки
          </CardTitle>
          <CardDescription>
            Получите полный доступ к торговому боту с оплатой криптовалютой через Plisio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
{plansLoading ? (
              <div className="col-span-full text-center py-8">
                <p>Загрузка тарифов...</p>
              </div>
            ) : pricingPlans.map((plan) => (
              <Card 
                key={plan.id} 
                className={`cursor-pointer transition-all ${
                  selectedPlan?.id === plan.id 
                    ? 'ring-2 ring-primary border-primary' 
                    : 'hover:shadow-md'
                }`}
                onClick={() => setSelectedPlan(plan)}
              >
                <CardHeader>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <div className="text-2xl font-bold">
                    ${plan.price}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{plan.duration} дней
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedPlan && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Выбранный план: {selectedPlan.name}</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Стоимость: ${selectedPlan.price} USD • Срок действия: {selectedPlan.duration} дней
              </p>
              
              <Alert className="mb-4">
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Оплата производится через безопасный сервис Plisio. 
                  Поддерживаются Bitcoin, Ethereum, USDT и другие криптовалюты.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button 
                  onClick={() => createPayment(selectedPlan)}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? 'Создание платежа...' : 'Оплатить криптовалютой'}
                </Button>
                
                {paymentUrl && (
                  <Button 
                    variant="outline"
                    onClick={checkPaymentStatus}
                    disabled={loading}
                  >
                    Проверить статус
                  </Button>
                )}
              </div>
            </div>
          )}

          {paymentUrl && (
            <Alert className="mt-4">
              <Zap className="h-4 w-4" />
              <AlertDescription>
                Платеж создан! Если окно оплаты не открылось, 
                <a 
                  href={paymentUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline ml-1"
                >
                  нажмите здесь
                </a>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Преимущества подписки</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Безопасность</h4>
                <p className="text-sm text-muted-foreground">
                  Все API ключи хранятся в зашифрованном виде
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Автоматизация</h4>
                <p className="text-sm text-muted-foreground">
                  Торговля 24/7 без вашего участия
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Поддержка</h4>
                <p className="text-sm text-muted-foreground">
                  Техническая поддержка и обновления
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Криптоплатежи</h4>
                <p className="text-sm text-muted-foreground">
                  Анонимная оплата криптовалютой
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentComponent;