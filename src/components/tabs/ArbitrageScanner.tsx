import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { 
  TrendingUp, 
  Search, 
  Play, 
  Pause,
  DollarSign,
  Clock,
  BarChart3,
  Zap
} from 'lucide-react';

interface ArbitrageOpportunity {
  id: string;
  symbol: string;
  exchange_buy: string;
  exchange_sell: string;
  price_buy: number;
  price_sell: number;
  spread_percent: number;
  volume_24h_usd: number;
  max_trade_amount: number;
  created_at: string;
}

const ArbitrageScanner = () => {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  // Загрузка активных возможностей при монтировании
  useEffect(() => {
    loadOpportunities();
    const interval = setInterval(loadOpportunities, 30000); // Обновляем каждые 30 секунд
    return () => clearInterval(interval);
  }, []);

  const loadOpportunities = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('arbitrage_scanner_2025_11_12_04_50', {
        body: { action: 'get_opportunities' }
      });

      if (error) throw error;

      if (data.success) {
        setOpportunities(data.opportunities);
      }
    } catch (error) {
      console.error('Ошибка загрузки возможностей:', error);
    }
  };

  const startScan = async () => {
    setIsScanning(true);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('arbitrage_scanner_2025_11_12_04_50', {
        body: { action: 'scan_opportunities' }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "🔍 Сканирование завершено",
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

  const executeArbitrage = async (opportunity: ArbitrageOpportunity) => {
    try {
      const { data, error } = await supabase.functions.invoke('arbitrage_scanner_2025_11_12_04_50', {
        body: { 
          action: 'execute_trade',
          opportunity_id: opportunity.id,
          amount: Math.min(opportunity.max_trade_amount, 1.0), // Начинаем с малых объемов
          leverage: 1
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "🚀 Сделка запущена",
          description: `Арбитраж для ${opportunity.symbol} начат`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Ошибка выполнения",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const getExchangeColor = (exchange: string) => {
    const colors: { [key: string]: string } = {
      bybit: 'bg-orange-600',
      binance: 'bg-yellow-600',
      gate: 'bg-blue-600',
      kucoin: 'bg-green-600',
      okx: 'bg-purple-600',
      mexc: 'bg-red-600'
    };
    return colors[exchange] || 'bg-gray-600';
  };

  return (
    <div className="space-y-6">
      {/* Заголовок и управление */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Search className="h-5 w-5 mr-2" />
            🔍 Арбитражный Сканер
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <Button
                onClick={startScan}
                disabled={isScanning || loading}
                className="bg-blue-600 hover:bg-blue-700"
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
              Найдено возможностей: <span className="text-white font-semibold">{opportunities.length}</span>
            </div>
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center">
                <TrendingUp className="h-5 w-5 text-green-400 mr-2" />
                <div>
                  <p className="text-sm text-gray-400">Лучший спред</p>
                  <p className="text-lg font-semibold text-white">
                    {opportunities.length > 0 ? `${Math.max(...opportunities.map(o => o.spread_percent)).toFixed(2)}%` : '0%'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center">
                <BarChart3 className="h-5 w-5 text-blue-400 mr-2" />
                <div>
                  <p className="text-sm text-gray-400">Общий объем</p>
                  <p className="text-lg font-semibold text-white">
                    {formatCurrency(opportunities.reduce((sum, o) => sum + o.volume_24h_usd, 0))}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center">
                <Zap className="h-5 w-5 text-yellow-400 mr-2" />
                <div>
                  <p className="text-sm text-gray-400">Активных</p>
                  <p className="text-lg font-semibold text-white">{opportunities.length}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Список возможностей */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">💰 Активные Возможности</CardTitle>
        </CardHeader>
        <CardContent>
          {opportunities.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Нет активных арбитражных возможностей</p>
              <p className="text-sm">Нажмите "Сканировать" для поиска</p>
            </div>
          ) : (
            <div className="space-y-4">
              {opportunities.map((opp) => (
                <div key={opp.id} className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{opp.symbol}</h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge className={`${getExchangeColor(opp.exchange_buy)} text-white`}>
                            {opp.exchange_buy.toUpperCase()}
                          </Badge>
                          <span className="text-gray-400">→</span>
                          <Badge className={`${getExchangeColor(opp.exchange_sell)} text-white`}>
                            {opp.exchange_sell.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-400">
                          {opp.spread_percent.toFixed(2)}%
                        </p>
                        <p className="text-xs text-gray-400">спред</p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Цены</p>
                        <p className="text-white">
                          ${opp.price_buy.toFixed(2)} → ${opp.price_sell.toFixed(2)}
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Объем 24ч</p>
                        <p className="text-white">{formatCurrency(opp.volume_24h_usd)}</p>
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => executeArbitrage(opp)}
                      className="bg-green-600 hover:bg-green-700"
                      size="sm"
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Выполнить
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ArbitrageScanner;
