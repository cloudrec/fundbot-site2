import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Shield, 
  ArrowLeftRight, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  X,
  RefreshCw,
  Eye
} from 'lucide-react';

interface HedgePosition {
  id: string;
  bot_type: string;
  main_exchange: string;
  main_symbol: string;
  main_side: string;
  main_quantity: number;
  main_entry_price: number;
  hedge_exchange: string;
  hedge_side: string;
  hedge_type: string;
  hedge_quantity: number;
  hedge_entry_price: number;
  expected_funding_rate: number;
  expected_profit_usd: number;
  status: string;
  funding_received: boolean;
  created_at: string;
  funding_received_at?: string;
  closed_at?: string;
  actual_profit_usd?: number;
  close_reason?: string;
}

interface HedgePositionsProps {
  botType: 'smart_bot' | 'funding_bot';
  user?: any;
}

const HedgePositions: React.FC<HedgePositionsProps> = ({ botType, user }) => {
  const { toast } = useToast();
  const [positions, setPositions] = useState<{
    active: HedgePosition[];
    waiting_convergence: HedgePosition[];
    closed: HedgePosition[];
    total_profit: number;
  }>({
    active: [],
    waiting_convergence: [],
    closed: [],
    total_profit: 0
  });
  const [loading, setLoading] = useState(false);
  const [monitoring, setMonitoring] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadPositions();
      // Автоматический мониторинг каждые 30 секунд
      const interval = setInterval(monitorPositions, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.id, botType]);

  const loadPositions = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('hedge_manager_2025_11_09_21_50', {
        body: {
          action: 'list',
          bot_type: botType
        }
      });

      if (error) throw error;

      if (data.success) {
        setPositions(data.positions);
      }
    } catch (error) {
      console.error('Error loading hedge positions:', error);
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось загрузить хеджированные позиции",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const monitorPositions = async () => {
    if (monitoring) return;
    
    try {
      setMonitoring(true);
      
      const { data, error } = await supabase.functions.invoke('hedge_manager_2025_11_09_21_50', {
        body: {
          action: 'monitor',
          bot_type: botType
        }
      });

      if (error) throw error;

      if (data.success) {
        // Обновляем позиции после мониторинга
        await loadPositions();
        
        // Показываем уведомления о закрытых позициях
        const closedPositions = data.results.filter(r => r.action.includes('closed'));
        if (closedPositions.length > 0) {
          toast({
            title: "🎯 Позиции закрыты",
            description: `Закрыто ${closedPositions.length} хеджированных позиций`,
          });
        }
      }
    } catch (error) {
      console.error('Error monitoring positions:', error);
    } finally {
      setMonitoring(false);
    }
  };

  const closePosition = async (positionId: string, reason: string = 'manual') => {
    try {
      const { data, error } = await supabase.functions.invoke('hedge_manager_2025_11_09_21_50', {
        body: {
          action: 'close',
          hedge_id: positionId,
          close_reason: reason
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "✅ Позиция закрыта",
          description: `Прибыль: $${data.actual_profit?.toFixed(2) || '0.00'}`,
        });
        await loadPositions();
      }
    } catch (error) {
      console.error('Error closing position:', error);
      toast({
        title: "Ошибка закрытия",
        description: "Не удалось закрыть позицию",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string, fundingReceived: boolean) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-blue-500">🔄 Активна</Badge>;
      case 'waiting_convergence':
        return <Badge variant="default" className="bg-orange-500">⏳ Ждет схождения</Badge>;
      case 'closed':
        return <Badge variant="secondary">✅ Закрыта</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getExchangeIcon = (exchange: string) => {
    const icons = {
      binance: '🟡',
      bybit: '🟠', 
      gate: '🟢',
      kucoin: '🔵',
      okx: '⚫',
      mexc: '🔴'
    };
    return icons[exchange] || '📈';
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('ru-RU');
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Войдите в систему для просмотра хеджированных позиций
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок и статистика */}
      <Card className="border-orange-500/20">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-orange-500" />
              Хеджированные позиции ({botType === 'smart_bot' ? 'Smart бот' : 'Фандинг бот'})
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={monitorPositions}
                disabled={monitoring}
                variant="outline"
                size="sm"
              >
                {monitoring ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                Мониторинг
              </Button>
              <Button
                onClick={loadPositions}
                disabled={loading}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Обновить
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Отслеживание хеджированных позиций и их прибыльности
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-blue-500/10 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{positions.active.length}</p>
              <p className="text-sm text-muted-foreground">Активных</p>
            </div>
            <div className="text-center p-3 bg-orange-500/10 rounded-lg">
              <p className="text-2xl font-bold text-orange-600">{positions.waiting_convergence.length}</p>
              <p className="text-sm text-muted-foreground">Ждут схождения</p>
            </div>
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{positions.closed.length}</p>
              <p className="text-sm text-muted-foreground">Закрытых</p>
            </div>
            <div className="text-center p-3 bg-purple-500/10 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">${positions.total_profit.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">Общая прибыль</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Активные позиции */}
      {positions.active.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-blue-500" />
              Активные позиции ({positions.active.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {positions.active.map((position) => (
                <div key={position.id} className="p-4 border rounded-lg bg-blue-500/5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(position.status, position.funding_received)}
                      <Badge variant="outline">{position.main_symbol}</Badge>
                    </div>
                    <Button
                      onClick={() => closePosition(position.id, 'manual')}
                      variant="destructive"
                      size="sm"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Закрыть
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-semibold">Основная позиция:</h4>
                      <p className="text-sm">
                        {getExchangeIcon(position.main_exchange)} {position.main_exchange.toUpperCase()} - 
                        {position.main_side === 'LONG' ? (
                          <TrendingUp className="inline h-4 w-4 text-green-500 mx-1" />
                        ) : (
                          <TrendingDown className="inline h-4 w-4 text-red-500 mx-1" />
                        )}
                        {position.main_side}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Количество: {position.main_quantity} | Цена: ${position.main_entry_price}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="font-semibold">Хеджирующая позиция:</h4>
                      <p className="text-sm">
                        {getExchangeIcon(position.hedge_exchange)} {position.hedge_exchange.toUpperCase()} - 
                        {position.hedge_side === 'LONG' ? (
                          <TrendingUp className="inline h-4 w-4 text-green-500 mx-1" />
                        ) : (
                          <TrendingDown className="inline h-4 w-4 text-red-500 mx-1" />
                        )}
                        {position.hedge_side} ({position.hedge_type})
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Количество: {position.hedge_quantity} | Цена: ${position.hedge_entry_price}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm">
                        <DollarSign className="inline h-4 w-4 text-green-500" />
                        Ожидаемая прибыль: ${position.expected_profit_usd.toFixed(2)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        <Clock className="inline h-4 w-4" />
                        Создана: {formatTime(position.created_at)}
                      </span>
                    </div>
                    <Badge variant={position.funding_received ? "default" : "outline"}>
                      {position.funding_received ? "💰 Фандинг получен" : "⏳ Ждет фандинг"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Позиции, ожидающие схождения */}
      {positions.waiting_convergence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Ожидают схождения цен ({positions.waiting_convergence.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {positions.waiting_convergence.map((position) => (
                <div key={position.id} className="p-4 border rounded-lg bg-orange-500/5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(position.status, position.funding_received)}
                      <Badge variant="outline">{position.main_symbol}</Badge>
                      <Badge variant="default" className="bg-green-500">💰 Фандинг получен</Badge>
                    </div>
                    <Button
                      onClick={() => closePosition(position.id, 'manual')}
                      variant="destructive"
                      size="sm"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Закрыть
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm">
                        {getExchangeIcon(position.main_exchange)} {position.main_exchange.toUpperCase()} ↔️ 
                        {getExchangeIcon(position.hedge_exchange)} {position.hedge_exchange.toUpperCase()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Ожидаемая прибыль: ${position.expected_profit_usd.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Фандинг получен: {position.funding_received_at ? formatTime(position.funding_received_at) : 'Да'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Закрытые позиции (последние 10) */}
      {positions.closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Закрытые позиции (последние 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {positions.closed.slice(0, 10).map((position) => (
                <div key={position.id} className="p-3 border rounded-lg bg-green-500/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{position.main_symbol}</Badge>
                      <span className="text-sm">
                        {getExchangeIcon(position.main_exchange)} ↔️ {getExchangeIcon(position.hedge_exchange)}
                      </span>
                      <Badge variant="secondary">{position.close_reason}</Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-600">
                        ${position.actual_profit_usd?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {position.closed_at ? formatTime(position.closed_at) : 'Закрыта'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Пустое состояние */}
      {positions.active.length === 0 && positions.waiting_convergence.length === 0 && positions.closed.length === 0 && !loading && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Нет хеджированных позиций</h3>
              <p className="text-muted-foreground">
                Включите хеджирование в настройках {botType === 'smart_bot' ? 'Smart бота' : 'фандинг бота'} для минимизации рисков
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default HedgePositions;