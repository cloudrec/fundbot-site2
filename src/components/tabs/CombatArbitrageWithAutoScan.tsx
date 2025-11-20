import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface FundingOpportunity {
  exchange: string;
  symbol: string;
  funding_rate_percent: number;
  profit_potential: number;
  next_funding_time: string;
}

interface ScanSummary {
  total_opportunities: number;
  active_exchanges: number;
  positive_rates: number;
  negative_rates: number;
  scan_time: string;
}

const CombatArbitrageWithAutoScan: React.FC = () => {
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [nextScanTime, setNextScanTime] = useState<string>('');

  // Автосканирование каждые 45 минут
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let timeUpdateInterval: NodeJS.Timeout;
    
    if (autoScanEnabled) {
      console.log('🤖 Автосканирование включено!');
      
      // Первое сканирование сразу
      scanFundingRates();
      
      // Устанавливаем интервал 45 минут (45 * 60 * 1000 мс)
      intervalId = setInterval(() => {
        console.log('⏰ Автоматическое сканирование...');
        scanFundingRates();
      }, 45 * 60 * 1000);
      
      // Обновляем время следующего сканирования
      const updateNextScanTime = () => {
        const nextTime = new Date(Date.now() + 45 * 60 * 1000);
        setNextScanTime(nextTime.toLocaleTimeString('ru-RU'));
      };
      
      updateNextScanTime();
      timeUpdateInterval = setInterval(updateNextScanTime, 60000); // Обновляем каждую минуту
    } else {
      console.log('🛑 Автосканирование выключено');
      setNextScanTime('');
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeUpdateInterval) clearInterval(timeUpdateInterval);
    };
  }, [autoScanEnabled]);

  const scanFundingRates = async () => {
    setIsScanning(true);
    setOpportunities([]);
    setSummary(null);
    
    try {
      console.log('🚀 ЗАПУСКАЮ BACKEND СКАНИРОВАНИЕ...');
      console.log('🌐 Вызываю Edge Function для сканирования всех бирж');
      
      const { data, error } = await supabase.functions.invoke('real_funding_scanner_2025_11_16_00_30');
      
      if (error) {
        throw new Error('Edge Function ошибка: ' + error.message);
      }
      
      if (!data.success) {
        throw new Error('Сканирование неуспешно: ' + data.error);
      }
      
      console.log('✅ BACKEND СКАНИРОВАНИЕ ЗАВЕРШЕНО!');
      console.log('📊 Получено возможностей: ' + data.data.length);
      console.log('🏢 Активных бирж: ' + data.summary.active_exchanges);
      console.log('⏱️ Время сканирования: ' + data.summary.scan_time);
      
      setOpportunities(data.data);
      setSummary(data.summary);
      
    } catch (error: any) {
      console.error('❌ Ошибка сканирования:', error);
      setOpportunities([]);
      setSummary(null);
    } finally {
      setIsScanning(false);
    }
  };

  const getExchangeColor = (exchange: string) => {
    const colors: { [key: string]: string } = {
      'Binance': 'bg-yellow-500',
      'Bybit': 'bg-orange-500', 
      'OKX': 'bg-blue-500',
      'KuCoin': 'bg-green-500',
      'Gate.io': 'bg-purple-500',
      'MEXC': 'bg-red-500',
      'Bitget': 'bg-indigo-500',
      'Huobi': 'bg-orange-600'
    };
    return colors[exchange] || 'bg-gray-500';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold">
                🚀 Боевой Арбитраж - BACKEND API (8 бирж)
              </CardTitle>
              <p className="text-muted-foreground mt-2">
                🚨 ТОЛЬКО НАСТОЯЩИЕ фандинг ставки через Backend API - БЕЗ CORS проблем
              </p>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              BACKEND API
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-3">
              <Button 
                onClick={scanFundingRates} 
                disabled={isScanning}
                className="w-full text-lg py-6"
              >
                {isScanning ? '⏳ Сканирование в фоне...' : 'BACKEND API - 8 Бирж (≥±0.3%)'}
              </Button>
              
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg border-2 border-dashed border-blue-300">
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={autoScanEnabled}
                      onChange={(e) => setAutoScanEnabled(e.target.checked)}
                      className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-lg font-bold text-blue-600">
                      🤖 Автосканирование (каждые 45 минут)
                    </span>
                  </label>
                </div>
                {autoScanEnabled && nextScanTime && (
                  <div className="text-lg font-semibold text-green-600">
                    ⏰ Следующее: {nextScanTime}
                  </div>
                )}
              </div>
              
              {autoScanEnabled && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700">
                    ✅ Автосканирование активно! Система будет автоматически сканировать фандинг ставки каждые 45 минут.
                  </p>
                </div>
              )}
            </div>
            
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{summary.total_opportunities}</div>
                  <div className="text-sm text-muted-foreground">Возможностей</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{summary.active_exchanges}</div>
                  <div className="text-sm text-muted-foreground">Активных бирж</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600">{summary.positive_rates}</div>
                  <div className="text-sm text-muted-foreground">Положительные</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{summary.negative_rates}</div>
                  <div className="text-sm text-muted-foreground">Отрицательные</div>
                </div>
              </div>
            )}
            
            {opportunities.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">
                  📊 Найдено {opportunities.length} возможностей:
                </h3>
                <div className="grid gap-3 max-h-96 overflow-y-auto">
                  {opportunities.map((opportunity, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Badge className={getExchangeColor(opportunity.exchange) + ' text-white'}>
                          {opportunity.exchange}
                        </Badge>
                        <span className="font-medium">{opportunity.symbol}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className={'font-bold ' + (opportunity.funding_rate_percent > 0 ? 'text-green-600' : 'text-red-600')}>
                          {opportunity.funding_rate_percent > 0 ? '+' : ''}{opportunity.funding_rate_percent.toFixed(4)}%
                        </span>
                        <span className="text-sm text-muted-foreground">
                          ${opportunity.profit_potential.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {!isScanning && opportunities.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-lg">🔍 Нажмите кнопку для сканирования</p>
                <p className="text-sm">Backend API выполнит сканирование всех бирж в фоне</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CombatArbitrageWithAutoScan;
