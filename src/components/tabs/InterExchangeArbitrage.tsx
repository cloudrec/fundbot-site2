import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface ArbitrageOpportunity {
  symbol: string;
  buy_exchange: string;
  sell_exchange: string;
  buy_price: number;
  sell_price: number;
  spread_percent: number;
  profit_potential: number;
  volume_24h_usd: number;
  min_order_size: number;
  max_order_size: number;
  timestamp: string;
}

interface ArbitrageSummary {
  total_opportunities: number;
  active_exchanges: number;
  avg_spread: number;
  max_spread: number;
  scan_time: string;
}

const InterExchangeArbitrage: React.FC = () => {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [summary, setSummary] = useState<ArbitrageSummary | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [nextScanTime, setNextScanTime] = useState<string>('');

  // Автосканирование каждые 30 секунд (для быстрого арбитража)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let timeUpdateInterval: NodeJS.Timeout;
    
    if (autoScanEnabled) {
      console.log('🤖 Межбиржевой арбитраж автосканирование включено!');
      
      // Первое сканирование сразу
      scanArbitrageOpportunities();
      
      // Устанавливаем интервал 30 секунд для быстрого арбитража
      intervalId = setInterval(() => {
        console.log('⏰ Автоматическое сканирование арбитража...');
        scanArbitrageOpportunities();
      }, 30 * 1000);
      
      // Обновляем время следующего сканирования
      const updateNextScanTime = () => {
        const nextTime = new Date(Date.now() + 30 * 1000);
        setNextScanTime(nextTime.toLocaleTimeString('ru-RU'));
      };
      
      updateNextScanTime();
      timeUpdateInterval = setInterval(updateNextScanTime, 1000); // Обновляем каждую секунду
    } else {
      console.log('🛑 Межбиржевой арбитраж автосканирование выключено');
      setNextScanTime('');
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeUpdateInterval) clearInterval(timeUpdateInterval);
    };
  }, [autoScanEnabled]);

  const scanArbitrageOpportunities = async () => {
    setIsScanning(true);
    
    try {
      console.log('🚀 ЗАПУСКАЮ СКАНИРОВАНИЕ МЕЖБИРЖЕВОГО АРБИТРАЖА...');
      console.log('🌐 Вызываю Edge Function для поиска спредов');
      
      const { data, error } = await supabase.functions.invoke('real_inter_exchange_arbitrage_2025_11_16_00_30", { body: { action: "scan", settings: settings } }');
        body: { action: "scan", settings: settings }
        body: { action: "scan_inter_exchange", settings }
      
      if (error) {
        throw new Error('Edge Function ошибка: ' + error.message);
      }
      
      if (!data.success) {
        throw new Error('Сканирование неуспешно: ' + data.error);
      }
      
      console.log('✅ МЕЖБИРЖЕВОЙ АРБИТРАЖ ЗАВЕРШЕН!');
      console.log('📊 Найдено возможностей: ' + data.data.length);
      console.log('🏢 Активных бирж: ' + data.summary.active_exchanges);
      console.log('📈 Максимальный спред: ' + data.summary.max_spread + '%');
      console.log('⏱️ Время сканирования: ' + data.summary.scan_time);
      
      setOpportunities(data.data);
      setSummary(data.summary);
      
    } catch (error: any) {
      console.error('❌ Ошибка сканирования арбитража:', error);
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

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(2);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold">
                💱 💱 Межбиржевой Арбитраж - РЕАЛЬНЫЕ СПРЕДЫ
              </CardTitle>
              <p className="text-muted-foreground mt-2">
                🎯 Поиск разницы цен между биржами • Оборот ≥0M • Спред ≥0.5%
              </p>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              АРБИТРАЖ
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-3">
              <Button 
                onClick={scanArbitrageOpportunities} 
                disabled={isScanning}
                className="w-full text-lg py-6"
              >
                {isScanning ? '⏳ Сканирование спредов...' : '💱 🚀 РЕАЛЬНЫЕ СПРЕДЫ (8 БИРЖ)'}
              </Button>
              
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg border-2 border-dashed border-green-300">
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={autoScanEnabled}
                      onChange={(e) => setAutoScanEnabled(e.target.checked)}
                      className="w-5 h-5 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                    />
                    <span className="text-lg font-bold text-green-600">
                      ⚡ Быстрое автосканирование (каждые 30 сек)
                    </span>
                  </label>
                </div>
                {autoScanEnabled && nextScanTime && (
                  <div className="text-lg font-semibold text-blue-600">
                    ⏰ Следующее: {nextScanTime}
                  </div>
                )}
              </div>
              
              {autoScanEnabled && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700">
                    ⚡ Быстрое сканирование активно! Система ищет арбитражные возможности каждые 30 секунд.
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
                  <div className="text-2xl font-bold text-purple-600">{summary.avg_spread.toFixed(2)}%</div>
                  <div className="text-sm text-muted-foreground">Средний спред</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{summary.max_spread.toFixed(2)}%</div>
                  <div className="text-sm text-muted-foreground">Макс спред</div>
                </div>
              </div>
            )}
            
            {opportunities.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">
                  💰 Найдено {opportunities.length} арбитражных возможностей:
                </h3>
                <div className="grid gap-3 max-h-96 overflow-y-auto">
                  {opportunities.map((opportunity, index) => (
                    <div key={index} className="p-4 border rounded-lg bg-gradient-to-r from-green-50 to-blue-50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          <span className="text-xl font-bold text-gray-800">{opportunity.symbol}</span>
                          <Badge className="bg-green-600 text-white">
                            {opportunity.spread_percent.toFixed(2)}% спред
                          </Badge>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">
                            +${opportunity.profit_potential.toFixed(2)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            прибыль на $1000
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="text-center">
                            <Badge className={getExchangeColor(opportunity.buy_exchange) + ' text-white mb-1'}>
                              {opportunity.buy_exchange}
                            </Badge>
                            <div className="text-sm font-semibold text-green-600">
                              КУПИТЬ: ${opportunity.buy_price.toFixed(4)}
                            </div>
                          </div>
                          
                          <div className="text-2xl">→</div>
                          
                          <div className="text-center">
                            <Badge className={getExchangeColor(opportunity.sell_exchange) + ' text-white mb-1'}>
                              {opportunity.sell_exchange}
                            </Badge>
                            <div className="text-sm font-semibold text-red-600">
                              ПРОДАТЬ: ${opportunity.sell_price.toFixed(4)}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right text-xs text-muted-foreground">
                          <div>Оборот: ${formatNumber(opportunity.volume_24h_usd)}</div>
                          <div>Мин: {opportunity.min_order_size}</div>
                          <div>Макс: {formatNumber(opportunity.max_order_size)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {!isScanning && opportunities.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-lg">🔍 Нажмите кнопку для поиска арбитража</p>
                <p className="text-sm">Система найдет разницу цен между биржами</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InterExchangeArbitrage;
