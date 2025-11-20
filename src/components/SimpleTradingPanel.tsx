import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

const SimpleTradingPanel = () => {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState('bybit');
  const [balance, setBalance] = useState<any>(null);

  const exchanges = [
    { id: 'bybit', name: 'Bybit', status: 'active' },
    { id: 'binance', name: 'Binance', status: 'active' },
    { id: 'gate', name: 'Gate.io', status: 'active' },
    { id: 'kucoin', name: 'KuCoin', status: 'inactive' },
    { id: 'okx', name: 'OKX', status: 'inactive' },
    { id: 'mexc', name: 'MEXC', status: 'inactive' }
  ];

  const checkBalance = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      console.log(`Проверка баланса для ${selectedExchange}...`);
      
      const { data, error } = await supabase.functions.invoke('real_trading_engine_2025_11_12_03_55', {
        body: {
          action: 'check_balance',
          exchange: selectedExchange
        }
      });

      if (error) throw error;

      if (data.success) {
        setBalance(data.data);
        toast({
          title: "✅ Баланс получен",
          description: `${selectedExchange}: ${data.data.balance?.USDT || 0} USDT`,
        });
      } else {
        throw new Error(data.error || 'Неизвестная ошибка');
      }
    } catch (error: any) {
      console.error('Ошибка проверки баланса:', error);
      toast({
        title: "❌ Ошибка",
        description: error.message || 'Не удалось получить баланс',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">🤖 Фандинг Арбитраж Бот</h1>
          <div className="flex items-center space-x-4">
            <Badge variant={isAdmin ? "default" : "secondary"}>
              {isAdmin ? "👑 Админ" : "👤 Пользователь"}
            </Badge>
            <Badge variant="outline">{user?.email}</Badge>
          </div>
        </div>

        {/* Exchange Selection */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">🏦 Выбор биржи</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {exchanges.map((exchange) => (
                <Button
                  key={exchange.id}
                  variant={selectedExchange === exchange.id ? "default" : "outline"}
                  className={`p-4 h-auto ${
                    selectedExchange === exchange.id 
                      ? 'bg-blue-600 hover:bg-blue-700' 
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                  onClick={() => setSelectedExchange(exchange.id)}
                  disabled={exchange.status === 'inactive'}
                >
                  <div className="text-center">
                    <div className="font-semibold">{exchange.name}</div>
                    <Badge 
                      variant={exchange.status === 'active' ? "default" : "secondary"}
                      className="mt-1"
                    >
                      {exchange.status === 'active' ? '✅ Активна' : '🔄 В разработке'}
                    </Badge>
                  </div>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Balance Check */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">💰 Проверка баланса</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300">Выбранная биржа:</p>
                <p className="text-xl font-semibold text-blue-400">{selectedExchange.toUpperCase()}</p>
              </div>
              <Button 
                onClick={checkBalance}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? '🔄 Проверка...' : '💰 Проверить баланс'}
              </Button>
            </div>
            
            {balance && (
              <div className="bg-gray-700 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">📊 Результат:</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-gray-400">Общий баланс:</p>
                    <p className="text-2xl font-bold text-green-400">
                      {balance.balance?.USDT || 0} USDT
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Доступно:</p>
                    <p className="text-xl text-blue-400">
                      {balance.balance?.available || 0} USDT
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">В использовании:</p>
                    <p className="text-xl text-yellow-400">
                      {balance.balance?.used || 0} USDT
                    </p>
                  </div>
                </div>
                {balance.note && (
                  <p className="text-sm text-gray-400 mt-2">ℹ️ {balance.note}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">⚡ Быстрые действия</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="outline" className="p-4 h-auto" disabled>
                <div className="text-center">
                  <div>🎯 Тест ордер</div>
                  <div className="text-xs text-gray-400 mt-1">В разработке</div>
                </div>
              </Button>
              <Button variant="outline" className="p-4 h-auto" disabled>
                <div className="text-center">
                  <div>🚀 Запуск бота</div>
                  <div className="text-xs text-gray-400 mt-1">В разработке</div>
                </div>
              </Button>
              <Button variant="outline" className="p-4 h-auto" disabled>
                <div className="text-center">
                  <div>❌ Отмена ордеров</div>
                  <div className="text-xs text-gray-400 mt-1">В разработке</div>
                </div>
              </Button>
              <Button variant="outline" className="p-4 h-auto" disabled>
                <div className="text-center">
                  <div>🔒 Закрыть позиции</div>
                  <div className="text-xs text-gray-400 mt-1">В разработке</div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">📊 Статус системы</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl mb-2">✅</div>
                <div className="font-semibold">Аутентификация</div>
                <div className="text-sm text-gray-400">Работает</div>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-2">✅</div>
                <div className="font-semibold">Supabase</div>
                <div className="text-sm text-gray-400">Подключен</div>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-2">🔄</div>
                <div className="font-semibold">Торговля</div>
                <div className="text-sm text-gray-400">Тестирование</div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default SimpleTradingPanel;
