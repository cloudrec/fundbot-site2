import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { 
  Triangle, 
  Search, 
  Play, 
  Pause,
  DollarSign,
  Clock,
  ArrowRight,
  Zap,
  TrendingUp
} from 'lucide-react';

interface TriangularOpportunity {
  id: string;
  base_currency: string;
  quote_currency: string;
  intermediate_currency: string;
  pair1: string;
  pair2: string;
  pair3: string;
  price1: number;
  price2: number;
  price3: number;
  direction1: string;
  direction2: string;
  direction3: string;
  profit_percent: number;
  profit_usd: number;
  min_volume: number;
  max_volume: number;
  exchange: string;
  created_at: string;
}

interface TriangularTrade {
  id: string;
  base_currency: string;
  intermediate_currency: string;
  exchange: string;
  initial_amount: number;
  expected_profit_usd: number;
  status: string;
  created_at: string;
}

const TriangularArbitrage = () => {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState<TriangularOpportunity[]>([]);
  const [trades, setTrades] = useState<TriangularTrade[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  // Загрузка данных при монтировании
  useEffect(() => {
    loadOpportunities();
    loadTrades();
    const interval = setInterval(() => {
      loadOpportunities();
      loadTrades();
    }, 15000); // Обновляем каждые 15 секунд (треугольный арбитраж быстрее)
    return () => clearInterval(interval);
  }, []);

  const loadOpportunities = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('triangular_arbitrage_2025_11_12_05_00', {
        body: { action: 'get_triangular_opportunities' }
      });

      if (error) throw error;

      if (data.success) {
        setOpportunities(data.opportunities);
      }
    } catch (error) {
      console.error('Ошибка загрузки треугольных возможностей:', error);
    }
  };

  const loadTrades = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('triangular_arbitrage_2025_11_12_05_00', {
        body: { action: 'get_triangular_trades' }
      });

      if (error) throw error;

      if (data.success) {
        setTrades(data.trades);
      }
    } catch (error) {
      console.error('Ошибка загрузки треугольных сделок:', error);
    }
  };

  const startScan = async () => {
    setIsScanning(true);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('triangular_arbitrage_2025_11_12_05_00', {
        body: { action: 'scan_triangular_opportunities' }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "🔺 Треугольное сканирование завершено",
          description: `Найдено ${data.opportunities_found} новых возможностей`,
        });
        
        await loadOpportunities();
      }
    } catch (error: any) {
      toast({
        title: "Ошибка сканирования",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
      setLoading(false);
    }
  };

  const executeTriangularTrade = async (opportunity: TriangularOpportunity) => {
    try {
      const { data, error } = await supabase.functions.invoke('triangular_arbitrage_2025_11_12_05_00', {
        body: { 
          action: 'execute_triangular_trade',
          opportunity_id: opportunity.id,
          amount: opportunity.min_volume
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "🔺 Треугольная сделка запущена",
          description: `Арбитраж ${opportunity.base_currency}→${opportunity.intermediate_currency}→${opportunity.base_currency} начат`,
        });
        
        await loadTrades();
      }
    } catch (error: any) {
      toast({
        title: "Ошибка выполнения",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getDirectionIcon = (direction: string) => {
    return direction === 'buy' ? '📈' : '📉';
  };

  const getDirectionColor = (direction: string) => {
    return direction === 'buy' ? 'text-green-400' : 'text-red-400';
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Заголовок и управление */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Triangle className="h-5 w-5 mr-2" />
            🔺 Треугольный Арбитраж
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <Button
                onClick={startScan}
                disabled={isScanning || loading}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isScanning ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Сканирование...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Сканировать
                  </>
                )}
              </Button>
              
              <Button
                onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                variant={autoScanEnabled ? "destructive" : "outline"}
                className={autoScanEnabled ? "" : "border-gray-600 text-gray-300"}
              >
                {autoScanEnabled ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Остановить авто
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Авто-сканирование
                  </>
                )}
              </Button>
            </div>
            
            <div className="text-sm text-gray-400">
              Треугольных возможностей: <span className="text-white font-semibold">{opportunities.length}</span>
            </div>
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center">
                <Triangle className="h-5 w-5 text-purple-400 mr-2" />
                <div>
                  <p className="text-sm text-gray-400">Лучшая прибыль</p>
                  <p className="text-lg font-semibold text-white">
                    {opportunities.length > 0 ? `${Math.max(...opportunities.map(o => o.profit_percent)).toFixed(2)}%` : '0%'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center">
                <DollarSign className="h-5 w-5 text-green-400 mr-2" />
                <div>
                  <p className="text-sm text-gray-400">Потенциальная прибыль</p>
                  <p className="text-lg font-semibold text-white">
                    {formatCurrency(opportunities.reduce((sum, o) => sum + o.profit_usd, 0))}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center">
                <Zap className="h-5 w-5 text-yellow-400 mr-2" />
                <div>
                  <p className="text-sm text-gray-400">Активных сделок</p>
                  <p className="text-lg font-semibold text-white">{trades.length}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Список треугольных возможностей */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">🔺 Треугольные Возможности</CardTitle>
        </CardHeader>
        <CardContent>
          {opportunities.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Triangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Нет активных треугольных возможностей</p>
              <p className="text-sm">Нажмите "Сканировать" для поиска</p>
            </div>
          ) : (
            <div className="space-y-4">
              {opportunities.map((opp) => (
                <div key={opp.id} className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                      {/* Треугольная схема */}
                      <div className="flex items-center space-x-2">
                        <div className="text-center">
                          <div className="text-lg font-semibold text-white">{opp.base_currency}</div>
                          <div className="text-xs text-gray-400">Старт</div>
                        </div>
                        
                        <div className="flex flex-col items-center">
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                          <div className={`text-xs ${getDirectionColor(opp.direction1)}`}>
                            {getDirectionIcon(opp.direction1)} {opp.direction1}
                          </div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-lg font-semibold text-white">{opp.intermediate_currency}</div>
                          <div className="text-xs text-gray-400">Промежуточная</div>
                        </div>
                        
                        <div className="flex flex-col items-center">
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                          <div className={`text-xs ${getDirectionColor(opp.direction2)}`}>
                            {getDirectionIcon(opp.direction2)} {opp.direction2}
                          </div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-lg font-semibold text-white">{opp.base_currency}</div>
                          <div className="text-xs text-gray-400">Финиш</div>
                        </div>
                      </div>
                      
                      {/* Прибыль */}
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-400">
                          {opp.profit_percent.toFixed(2)}%
                        </p>
                        <p className="text-sm text-gray-400">{formatCurrency(opp.profit_usd)}</p>
                      </div>
                      
                      {/* Детали */}
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Биржа</p>
                        <Badge className="bg-purple-600 text-white">
                          {opp.exchange.toUpperCase()}
                        </Badge>
                        <p className="text-xs text-gray-400 mt-1">
                          Объем: {opp.min_volume}-{opp.max_volume}
                        </p>
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => executeTriangularTrade(opp)}
                      className="bg-purple-600 hover:bg-purple-700"
                      size="sm"
                    >
                      <Triangle className="h-4 w-4 mr-1" />
                      Выполнить
                    </Button>
                  </div>
                  
                  {/* Пары и цены */}
                  <div className="mt-3 pt-3 border-t border-gray-600">
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div className="text-center">
                        <p className="text-gray-400">{opp.pair1}</p>
                        <p className="text-white">${opp.price1.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-400">{opp.pair2}</p>
                        <p className="text-white">${opp.price2.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-400">{opp.pair3}</p>
                        <p className="text-white">{opp.price3.toFixed(6)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Активные треугольные сделки */}
      {trades.length > 0 && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">⚡ Активные Треугольные Сделки</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trades.map((trade) => (
                <div key={trade.id} className="bg-gray-700 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div>
                        <p className="font-semibold text-white">
                          {trade.base_currency} → {trade.intermediate_currency} → {trade.base_currency}
                        </p>
                        <p className="text-sm text-gray-400">
                          {trade.exchange.toUpperCase()} • {trade.initial_amount} {trade.base_currency}
                        </p>
                      </div>
                      
                      <Badge variant={trade.status === 'active' ? 'default' : 'secondary'}>
                        {trade.status}
                      </Badge>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-green-400 font-semibold">
                        +{formatCurrency(trade.expected_profit_usd)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(trade.created_at).toLocaleTimeString('ru-RU')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TriangularArbitrage;
