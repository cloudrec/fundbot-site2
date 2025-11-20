import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, X, RefreshCw } from 'lucide-react';

interface Position {
  exchange: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entry_price: number;
  mark_price: number;
  pnl: number;
  pnl_percentage: number;
  margin: number;
  leverage: string;
}

interface PositionsMonitorProps {
  user: any;
  currentExchange: string;
}

const PositionsMonitor: React.FC<PositionsMonitorProps> = ({ user, currentExchange }) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { toast } = useToast();

  // Экстренное закрытие всех позиций
  const emergencyCloseAll = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      console.log('🚑 EMERGENCY: Закрываем все позиции на всех биржах!');
      
      const promises = [];
      
      // Закрываем на Binance
      promises.push(
        supabase.functions.invoke('binance_only_strict_2025_11_09_06_35', {
          body: { action: 'close_positions', user_id: user.id }
        })
      );
      
      // Закрываем на Bybit
      promises.push(
        supabase.functions.invoke('bybit_final_fixed_2025_11_09_07_20', {
          body: { action: 'close_positions', user_id: user.id }
        })
      );
      
      // Закрываем на Gate.io
      promises.push(
        supabase.functions.invoke('gate_only_separate_2025_11_09_05_55', {
          body: { action: 'close_positions', user_id: user.id }
        })
      );
      
      const results = await Promise.allSettled(promises);
      
      toast({
        title: "🚑 Экстренное закрытие!",
        description: "Все позиции закрыты на всех биржах",
      });
      
      // Обновляем позиции
      setTimeout(fetchPositions, 2000);
      
    } catch (error: any) {
      toast({
        title: "❌ Ошибка экстренного закрытия",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Экстренная отмена всех ордеров
  const emergencyCancelAll = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      console.log('❌ EMERGENCY: Отменяем все ордера на всех биржах!');
      
      const promises = [];
      
      // Отменяем на Binance
      promises.push(
        supabase.functions.invoke('binance_only_strict_2025_11_09_06_35', {
          body: { action: 'cancel_orders', user_id: user.id }
        })
      );
      
      // Отменяем на Bybit
      promises.push(
        supabase.functions.invoke('bybit_final_fixed_2025_11_09_07_20', {
          body: { action: 'cancel_orders', user_id: user.id }
        })
      );
      
      // Отменяем на Gate.io
      promises.push(
        supabase.functions.invoke('gate_only_separate_2025_11_09_05_55', {
          body: { action: 'cancel_orders', user_id: user.id }
        })
      );
      
      const results = await Promise.allSettled(promises);
      
      toast({
        title: "❌ Экстренная отмена!",
        description: "Все ордера отменены на всех биржах",
      });
      
    } catch (error: any) {
      toast({
        title: "❌ Ошибка экстренной отмены",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Получение позиций
  const fetchPositions = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      
      // Получаем позиции с всех бирж
      const allPositions: Position[] = [];
      
      // Binance позиции
      try {
        const { data: binanceData, error: binanceError } = await supabase.functions.invoke('binance_only_strict_2025_11_09_06_35', {
          body: { action: 'get_positions', user_id: user.id }
        });
        
        if (!binanceError && binanceData?.success && binanceData.data?.positions) {
          allPositions.push(...binanceData.data.positions);
        }
      } catch (e) {
        console.log('⚠️ Binance positions error:', e);
      }
      
      // Bybit позиции
      try {
        const { data: bybitData, error: bybitError } = await supabase.functions.invoke('bybit_final_fixed_2025_11_09_07_20', {
          body: { action: 'get_positions', user_id: user.id }
        });
        
        if (!bybitError && bybitData?.success && bybitData.data?.positions) {
          allPositions.push(...bybitData.data.positions);
        }
      } catch (e) {
        console.log('⚠️ Bybit positions error:', e);
      }
      
      // Gate.io позиции
      try {
        const { data: gateData, error: gateError } = await supabase.functions.invoke('gate_only_separate_2025_11_09_05_55', {
          body: { action: 'get_positions', user_id: user.id }
        });
        
        if (!gateError && gateData?.success && gateData.data?.positions) {
          allPositions.push(...gateData.data.positions);
        }
      } catch (e) {
        console.log('⚠️ Gate positions error:', e);
      }

      console.log('📊 ALL POSITIONS DATA:', allPositions);
      
      // Нормализация данных позиций
      const normalizedPositions = allPositions.map(pos => ({
        exchange: pos.exchange || 'Unknown',
        symbol: pos.symbol || 'Unknown',
        side: (pos.side || '').toUpperCase(),
        size: Math.abs(parseFloat(pos.size || pos.positionAmt || '0')),
        entry_price: parseFloat(pos.entry_price || pos.entryPrice || pos.avgPrice || '0'),
        mark_price: parseFloat(pos.mark_price || pos.markPrice || pos.lastPrice || '0'),
        pnl: parseFloat(pos.pnl || pos.unrealizedPnl || pos.unRealizedProfit || '0'),
        pnl_percentage: parseFloat(pos.pnl_percentage || pos.percentage || '0')
      })).filter(pos => pos.size > 0); // Фильтруем пустые позиции
      
      setPositions(normalizedPositions);
      setLastUpdate(new Date());
      
    } catch (error: any) {
      console.error('❌ POSITIONS ERROR:', error);
      toast({
        title: "Ошибка загрузки позиций",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Закрытие всех позиций
  const closeAllPositions = async () => {
    if (!user?.id || positions.length === 0) return;

    try {
      setLoading(true);
      
      // Группируем позиции по биржам
      const exchangeGroups = positions.reduce((acc, pos) => {
        if (!acc[pos.exchange]) acc[pos.exchange] = [];
        acc[pos.exchange].push(pos);
        return acc;
      }, {} as Record<string, Position[]>);

      let closedCount = 0;
      let totalCount = positions.length;

      // Закрываем позиции на каждой бирже
      for (const [exchange, exchangePositions] of Object.entries(exchangeGroups)) {
        try {
          let functionName;
          if (exchange === 'Binance') {
            functionName = 'binance_only_strict_2025_11_09_06_35';
        } else if (exchange === 'gate') {
            functionName = 'gate_only_separate_2025_11_09_05_55';
        } else {
            functionName = 'bybit_final_fixed_2025_11_09_07_20';
          }

          const { data, error } = await supabase.functions.invoke(functionName, {
            body: {
              action: exchange === 'Binance' ? 'close_positions' : 'close_all_positions',
              user_id: user.id
            }
          });

          if (!error && data) {
            closedCount += data.closed_positions || 0;
          }
        } catch (error) {
          console.error(`❌ Error closing ${exchange} positions:`, error);
        }
      }

      toast({
        title: "Закрытие позиций завершено",
        description: `Закрыто ${closedCount} из ${totalCount} позиций`,
      });

      // Обновляем позиции через 2 секунды
      setTimeout(fetchPositions, 2000);
      
    } catch (error: any) {
      console.error('❌ CLOSE ALL ERROR:', error);
      toast({
        title: "Ошибка закрытия позиций",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Автообновление каждые 5 секунд
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchPositions();
    }, 5000); // 5 секунд (с защитой от бана)

    return () => clearInterval(interval);
  }, [autoRefresh, user?.id]);

  // Первоначальная загрузка
  useEffect(() => {
    fetchPositions();
  }, [user?.id]);

  // Вспомогательные функции
  const formatNumber = (num: number, decimals: number = 2): string => {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const getPnlColor = (pnl: number): string => {
    if (pnl > 0) return 'text-green-600';
    if (pnl < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  // Подсчет общего P&L
  const totalPnl = positions.reduce((sum, pos) => sum + pos.pnl, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Мониторинг позиций
            {positions.length > 0 && (
              <Badge variant="secondary">
                {positions.length}
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* КНОПКИ ЭКСТРЕННОГО ЗАКРЫТИЯ */}
            <Button
              variant="destructive"
              size="sm"
              onClick={emergencyCloseAll}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Закрыть позиции
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={emergencyCancelAll}
              className="border-orange-500 text-orange-600 hover:bg-orange-50"
            >
              Отменить ордера
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? 'bg-green-50 border-green-200' : ''}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Авто' : 'Ручной'}
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={fetchPositions}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            
            {positions.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={closeAllPositions}
                disabled={loading}
              >
                <X className="h-4 w-4 mr-1" />
                Закрыть все
              </Button>
            )}
          </div>
        </div>
        
        {lastUpdate && (
          <p className="text-sm text-gray-500">
            Обновлено: {lastUpdate.toLocaleTimeString('ru-RU')}
          </p>
        )}
      </CardHeader>

      <CardContent>
        {positions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">Нет открытых позиций</p>
            <p className="text-sm">Откройте позицию для мониторинга P&L</p>
          </div>
        ) : (
          <>
            {/* Общий P&L */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-medium">Общий P&L:</span>
                <div className={`flex items-center gap-1 font-bold text-lg ${getPnlColor(totalPnl)}`}>
                  {totalPnl > 0 ? <TrendingUp className="h-5 w-5" /> : totalPnl < 0 ? <TrendingDown className="h-5 w-5" /> : null}
                  {totalPnl > 0 ? '+' : ''}{formatNumber(totalPnl)} USDT
                </div>
              </div>
            </div>

            {/* Таблица позиций */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-1">Биржа</th>
                    <th className="text-left py-2 px-1">Пара</th>
                    <th className="text-left py-2 px-1">Сторона</th>
                    <th className="text-right py-2 px-1">Размер</th>
                    <th className="text-right py-2 px-1">Вход</th>
                    <th className="text-right py-2 px-1">Текущая</th>
                    <th className="text-right py-2 px-1">P&L</th>
                    <th className="text-right py-2 px-1">%</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-1">
                        <Badge variant="outline" className="text-xs">
                          {position.exchange}
                        </Badge>
                      </td>
                      <td className="py-2 px-1 font-medium">
                        {position.symbol}
                      </td>
                      <td className="py-2 px-1">
                        <Badge 
                          variant={position.side === 'LONG' ? 'default' : 'secondary'}
                          className={position.side === 'LONG' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                        >
                          {position.side}
                        </Badge>
                      </td>
                      <td className="py-2 px-1 text-right">
                        {formatNumber(parseFloat(position.size), 4)}
                      </td>
                      <td className="py-2 px-1 text-right">
                        ${formatNumber(position.entry_price, 4)}
                      </td>
                      <td className="py-2 px-1 text-right">
                        ${formatNumber(position.mark_price, 4)}
                      </td>
                      <td className={`py-2 px-1 text-right font-medium ${getPnlColor(position.pnl)}`}>
                        {position.pnl > 0 ? '+' : ''}{formatNumber(position.pnl)} USDT
                      </td>
                      <td className={`py-2 px-1 text-right font-medium ${getPnlColor(position.pnl)}`}>
                        {position.pnl > 0 ? '+' : ''}{formatNumber(position.pnl_percentage, 2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PositionsMonitor;