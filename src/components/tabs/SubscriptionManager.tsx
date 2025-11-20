import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { 
  Crown, 
  Check, 
  CreditCard, 
  Calendar, 
  Zap,
  Star,
  Gift,
  ExternalLink
} from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  description: string;
  price_usd: number;
  price_crypto: any;
  duration_days: number;
  max_exchanges: number;
  max_daily_trades: number;
  features: string[];
  is_active: boolean;
}

interface UserProfile {
  subscription_plan: string;
  subscription_status: string;
  subscription_expires_at: string;
  max_exchanges: number;
  max_daily_trades: number;
}

const CRYPTO_CURRENCIES = [
  { value: 'BTC', label: 'Bitcoin (BTC)', icon: '₿' },
  { value: 'ETH', label: 'Ethereum (ETH)', icon: 'Ξ' },
  { value: 'USDT', label: 'Tether (USDT)', icon: '₮' },
  { value: 'LTC', label: 'Litecoin (LTC)', icon: 'Ł' },
  { value: 'BCH', label: 'Bitcoin Cash (BCH)', icon: '₿' }
];

export default function SubscriptionManager() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('USDT');

  useEffect(() => {
    if (user) {
      loadPlans();
      loadUserProfile();
    }
  }, [user]);

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('plisio_payment_2025_11_12_03_45', {
        body: { action: 'get_plans' }
      });

      if (error) throw error;
      setPlans(data.data || []);
    } catch (error: any) {
      console.error('Error loading plans:', error);
    }
  };

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('subscription_plan, subscription_status, subscription_expires_at, max_exchanges, max_daily_trades')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (error: any) {
      console.error('Error loading user profile:', error);
    }
  };

  const handlePayment = async (planId: string) => {
    if (!selectedCurrency) {
      toast({
        title: "Выберите валюту",
        description: "Пожалуйста, выберите криптовалюту для оплаты",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('plisio_payment_2025_11_12_03_45', {
        body: {
          action: 'create_invoice',
          plan_id: planId,
          currency: selectedCurrency
        }
      });

      if (error) throw error;

      if (data.success) {
        // Открываем страницу оплаты в новом окне
        window.open(data.data.invoice_url, '_blank');
        
        toast({
          title: "Счет создан",
          description: "Перейдите на страницу оплаты для завершения покупки",
        });
      } else {
        throw new Error(data.error || 'Ошибка создания счета');
      }
    } catch (error: any) {
      toast({
        title: "Ошибка оплаты",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getPlanBadgeVariant = (planName: string) => {
    switch (planName.toLowerCase()) {
      case 'базовый':
        return 'secondary';
      case 'профессиональный':
        return 'default';
      case 'премиум':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const isCurrentPlan = (planName: string) => {
    return userProfile?.subscription_plan === planName && userProfile?.subscription_status === 'active';
  };

  const isExpired = () => {
    if (!userProfile?.subscription_expires_at) return false;
    return new Date(userProfile.subscription_expires_at) < new Date();
  };

  const getDaysLeft = () => {
    if (!userProfile?.subscription_expires_at) return 0;
    const expiresAt = new Date(userProfile.subscription_expires_at);
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6">
      {/* Current Subscription Status */}
      {userProfile && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Crown className="h-5 w-5 text-yellow-400" />
              <span>Текущая подписка</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <Badge variant={getPlanBadgeVariant(userProfile.subscription_plan)}>
                    {userProfile.subscription_plan || 'Бесплатный'}
                  </Badge>
                  <Badge variant={userProfile.subscription_status === 'active' ? 'default' : 'secondary'}>
                    {userProfile.subscription_status === 'active' ? 'Активна' : 'Неактивна'}
                  </Badge>
                </div>
                <p className="text-sm text-gray-400">
                  {userProfile.subscription_expires_at ? (
                    isExpired() ? (
                      <span className="text-red-400">Истекла {new Date(userProfile.subscription_expires_at).toLocaleDateString('ru-RU')}</span>
                    ) : (
                      <span>Действует до {new Date(userProfile.subscription_expires_at).toLocaleDateString('ru-RU')} ({getDaysLeft()} дней)</span>
                    )
                  ) : (
                    'Бессрочная'
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400">Лимиты:</p>
                <p className="text-sm">
                  {userProfile.max_exchanges} бирж • {userProfile.max_daily_trades} сделок/день
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Currency Selection */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CreditCard className="h-5 w-5" />
            <span>Выбор валюты для оплаты</span>
          </CardTitle>
          <CardDescription>Выберите криптовалюту для оплаты подписки</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
            <SelectTrigger className="bg-gray-700 border-gray-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-700 border-gray-600">
              {CRYPTO_CURRENCIES.map(currency => (
                <SelectItem key={currency.value} value={currency.value}>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{currency.icon}</span>
                    <span>{currency.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Subscription Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map(plan => {
          const isYearly = plan.duration_days >= 365;
          const monthlyCost = plan.price_usd / (plan.duration_days / 30);
          const cryptoPrice = plan.price_crypto?.[selectedCurrency];
          const currentPlan = isCurrentPlan(plan.name);

          return (
            <Card key={plan.id} className={`bg-gray-800 border-gray-700 relative ${
              plan.name === 'Премиум' ? 'ring-2 ring-purple-500' : ''
            }`}>
              {plan.name === 'Премиум' && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-purple-600 text-white">
                    <Star className="h-3 w-3 mr-1" />
                    Популярный
                  </Badge>
                </div>
              )}
              
              {isYearly && (
                <div className="absolute -top-3 right-4">
                  <Badge className="bg-green-600 text-white">
                    <Gift className="h-3 w-3 mr-1" />
                    Скидка 17%
                  </Badge>
                </div>
              )}

              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  <Badge variant={getPlanBadgeVariant(plan.name)}>
                    {plan.max_exchanges} бирж
                  </Badge>
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Price */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">
                    ${plan.price_usd}
                  </div>
                  {cryptoPrice && (
                    <div className="text-lg text-gray-400">
                      {cryptoPrice} {selectedCurrency}
                    </div>
                  )}
                  <div className="text-sm text-gray-400">
                    {isYearly ? 'в год' : 'в месяц'}
                    {isYearly && (
                      <span className="block text-green-400">
                        ~${monthlyCost.toFixed(2)}/месяц
                      </span>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Check className="h-4 w-4 text-green-400" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Limits */}
                <div className="bg-gray-700 p-3 rounded text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span>Максимум бирж:</span>
                    <span className="font-semibold">{plan.max_exchanges}</span>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span>Сделок в день:</span>
                    <span className="font-semibold">
                      {plan.max_daily_trades === 1000 ? 'Безлимит' : plan.max_daily_trades}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Период:</span>
                    <span className="font-semibold">
                      {plan.duration_days} дней
                    </span>
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  className={`w-full ${
                    plan.name === 'Премиум' 
                      ? 'bg-purple-600 hover:bg-purple-700' 
                      : plan.name === 'Профессиональный'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                  onClick={() => handlePayment(plan.id)}
                  disabled={loading || currentPlan}
                >
                  {loading ? (
                    'Создание счета...'
                  ) : currentPlan ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Текущий план
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Оплатить {selectedCurrency}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Payment Info */}
      <Card className="bg-blue-900/20 border-blue-700">
        <CardContent className="p-6">
          <h3 className="font-semibold text-blue-400 mb-3">💳 Информация об оплате</h3>
          <ul className="text-sm text-gray-300 space-y-2">
            <li>• Оплата производится через защищенный сервис Plisio</li>
            <li>• Поддерживаются все основные криптовалюты</li>
            <li>• Подписка активируется автоматически после подтверждения платежа</li>
            <li>• Возврат средств возможен в течение 7 дней</li>
            <li>• При возникновении проблем обращайтесь в поддержку</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
