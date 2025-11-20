import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const SubscriptionTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSubscriptionPlans();
  }, []);

  const loadSubscriptionPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans_editable_2025_11_12_05_30')
        .select('*')
        .order('price');

      if (error) throw error;

      setPlans(data || []);
    } catch (error: any) {
      console.error('Ошибка загрузки планов:', error);
    }
  };

  const selectPlan = async (planId: string) => {
    setLoading(true);
    
    try {
      // Здесь будет логика выбора плана
      toast({
        title: "Успех",
        description: "План подписки выбран (демо)",
      });
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: `Ошибка выбора плана: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">💳 Планы подписки</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.length > 0 ? (
              plans.map((plan) => (
                <div key={plan.id} className="bg-gray-700 p-6 rounded-lg">
                  <div className="text-center">
                    <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
                    <div className="text-3xl font-bold text-blue-400 mb-4">
                      ${plan.price}
                      <span className="text-sm text-gray-400">/мес</span>
                    </div>
                    
                    <div className="space-y-2 mb-6 text-sm text-gray-300">
                      <div>• API ключи: {plan.max_api_keys}</div>
                      <div>• Стратегии: {plan.max_strategies}</div>
                      <div>• Поддержка: {plan.support_level}</div>
                      {plan.features && (
                        <div>• {plan.features}</div>
                      )}
                    </div>

                    <Button
                      onClick={() => selectPlan(plan.id)}
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      {loading ? '🔄 Обработка...' : 'Выбрать план'}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 text-center py-8">
                <div className="text-6xl mb-4">💳</div>
                <h3 className="text-xl font-semibold text-white mb-2">Планы подписки</h3>
                <p className="text-gray-400 mb-4">
                  Планы подписки загружаются...
                </p>
                <Button onClick={loadSubscriptionPlans} variant="outline">
                  🔄 Обновить
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Текущая подписка */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">📊 Текущая подписка</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Бесплатный план</h3>
              <p className="text-gray-400">Базовые возможности торгового бота</p>
            </div>
            <Badge variant="secondary">Активен</Badge>
          </div>
          
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">6</div>
              <div className="text-xs text-gray-400">Бирж доступно</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">∞</div>
              <div className="text-xs text-gray-400">API ключи</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">3</div>
              <div className="text-xs text-gray-400">Стратегии</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">✅</div>
              <div className="text-xs text-gray-400">Telegram</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionTab;
