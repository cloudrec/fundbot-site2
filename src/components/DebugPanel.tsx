import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const DebugPanel = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  };

  const testBalance = async (exchange: string) => {
    setLoading(true);
    addLog(`🧪 Тестируем баланс ${exchange}...`);
    
    try {
      console.log(`Вызываем функцию для ${exchange}...`);
      
      const { data, error } = await supabase.functions.invoke('improved_trading_engine_with_smart_demo_2025_11_12_09_00', {
        body: { action: 'check_balance', exchange: exchange }
      });

      console.log(`Результат для ${exchange}:`, { data, error });
      console.log(`Детали data для ${exchange}:`, JSON.stringify(data, null, 2));

      if (error) {
        addLog(`❌ ${exchange}: ОШИБКА - ${error.message}`);
        console.error(`Ошибка ${exchange}:`, error);
      } else if (data && data.success) {
        const balance = data.balance;
        const usdtTotal = balance?.USDT?.total || balance?.total_usdt || 0;
        const isDemoText = data.is_demo ? ' (демо)' : '';
        addLog(`✅ ${exchange}: ${usdtTotal.toFixed(2)} USDT${isDemoText}`);
        
        // Дополнительная информация
        if (balance?.BTC?.total) {
          addLog(`   └─ BTC: ${balance.BTC.total.toFixed(6)}`);
        }
        if (balance?.error) {
          addLog(`   └─ API Error: ${balance.error}`);
        }
      } else if (data && !data.success) {
        addLog(`❌ ${exchange}: ${data.error || 'Неизвестная ошибка'}`);
        if (data.balance?.error) {
          addLog(`   └─ Детали: ${data.balance.error}`);
        }
      } else if (data) {
        addLog(`⚠️ ${exchange}: Получены данные, но нет success флага`);
        addLog(`   └─ Data: ${JSON.stringify(data).substring(0, 100)}...`);
      } else {
        addLog(`⚠️ ${exchange}: Нет данных в ответе`);
      }
      
    } catch (error: any) {
      addLog(`💥 ${exchange}: КРИТИЧЕСКАЯ ОШИБКА - ${error.message}`);
      console.error(`Критическая ошибка ${exchange}:`, error);
    } finally {
      setLoading(false);
    }
  };

  const testAllBalances = async () => {
    const exchanges = ['bybit', 'binance', 'gate', 'kucoin', 'okx', 'mexc'];
    addLog(`🚀 Начинаем тест всех ${exchanges.length} бирж...`);
    
    for (const exchange of exchanges) {
      await testBalance(exchange);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Пауза между запросами
    }
    
    addLog(`🏁 Тест всех бирж завершен!`);
  };

  const clearLogs = () => {
    setLogs([]);
    addLog(`🗑️ Логи очищены`);
  };

  const testSpecificFunction = async () => {
    addLog(`🔧 Тестируем прямой вызов функции...`);
    
    try {
      const response = await fetch('/api/openai/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'Hello' }) // Пример отправки сообщения
      });
      
      const result = await response.json();
      addLog(`📡 Прямой ответ: ${JSON.stringify(result).substring(0, 200)}...`);
      
    } catch (error: any) {
      addLog(`💥 Прямой вызов: ${error.message}`);
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-700 mb-6">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span>🔧 Панель отладки</span>
          <div className="flex space-x-2">
            <Badge variant="secondary">Debug Mode</Badge>
            <Badge variant={loading ? "destructive" : "default"}>
              {loading ? "🔄 Работает" : "⏸️ Готов"}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <Button 
            onClick={() => testBalance('bybit')} 
            disabled={loading}
            className="bg-yellow-600 hover:bg-yellow-700 text-xs"
          >
            🟡 Bybit
          </Button>
          <Button 
            onClick={() => testBalance('binance')} 
            disabled={loading}
            className="bg-orange-600 hover:bg-orange-700 text-xs"
          >
            🟨 Binance
          </Button>
          <Button 
            onClick={() => testBalance('gate')} 
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-xs"
          >
            🟦 Gate.io
          </Button>
          <Button 
            onClick={() => testBalance('kucoin')} 
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 text-xs"
          >
            🟢 KuCoin
          </Button>
          <Button 
            onClick={() => testBalance('okx')} 
            disabled={loading}
            className="bg-gray-600 hover:bg-gray-700 text-xs"
          >
            ⚫ OKX
          </Button>
          <Button 
            onClick={() => testBalance('mexc')} 
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-xs"
          >
            🔵 MEXC
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button 
            onClick={testAllBalances} 
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? '🔄 Тестируем...' : '🚀 Тест всех бирж'}
          </Button>
          <Button 
            onClick={testSpecificFunction} 
            disabled={loading}
            variant="outline"
          >
            🔧 Прямой тест
          </Button>
          <Button 
            onClick={clearLogs} 
            variant="outline"
          >
            🗑️ Очистить
          </Button>
        </div>

        <div className="bg-gray-900 p-3 rounded max-h-64 overflow-y-auto">
          <div className="text-xs font-mono text-gray-300">
            {logs.length > 0 ? (
              logs.map((log, index) => (
                <div key={index} className="mb-1 break-words">{log}</div>
              ))
            ) : (
              <div className="text-gray-500">Логи отладки появятся здесь...</div>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-400 space-y-1">
          <div>👤 Пользователь: {user?.email}</div>
          <div>🆔 ID: {user?.id?.substring(0, 8)}...</div>
          <div>⚡ Функция: improved_trading_engine_with_smart_demo_2025_11_12_09_00</div>
          <div>📊 Логов: {logs.length}/20</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DebugPanel;
