import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  BarChart3, 
  RefreshCw,
  Calendar,
  Target,
  Percent
} from 'lucide-react';

interface ProfitStats {
  total_profit_usd: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_profit_per_trade: number;
  best_trade: number;
  worst_trade: number;
  today_profit: number;
  week_profit: number;
  month_profit: number;
}

interface BotProfitDisplayProps {
  botType: 'smart_bot' | 'funding_bot' | 'manual_trading';
  user?: any;
  title: string;
  description: string;
  color: string;
}

const BotProfitDisplay: React.FC<BotProfitDisplayProps> = ({ 
  botType, 
  user, 
  title, 
  description, 
  color 
}) => {
  const { toast } = useToast();
  const [stats, setStats] = useState<ProfitStats>({
    total_profit_usd: 0,
    total_trades: 0,
    winning_trades: 0,
    losing_trades: 0,
    win_rate: 0,
    avg_profit_per_trade: 0,
    best_trade: 0,
    worst_trade: 0,
    today_profit: 0,
    week_profit: 0,
    month_profit: 0
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadProfitStats();
      // Обновляем статистику каждые 60 секунд
      const interval = setInterval(loadProfitStats, 60000);
      return () => clearInterval(interval);
    }
  }, [user?.id, botType]);

  const loadProfitStats = async () => {
    try {
      setLoading(true);
      
      // Симуляция загрузки статистики (в реальности здесь был бы API вызов)
      // В будущем это будет вызов Edge Function для расчета статистики
      
      // Генерируем реалистичные данные для демонстрации
      const mockStats: ProfitStats = {
        total_profit_usd: Math.random() * 1000 - 200, // От -200 до +800
        total_trades: Math.floor(Math.random() * 100) + 10,
        winning_trades: Math.floor(Math.random() * 60) + 5,
        losing_trades: Math.floor(Math.random() * 40) + 2,
        win_rate: 0,
        avg_profit_per_trade: 0,
        best_trade: Math.random() * 50 + 5,
        worst_trade: -(Math.random() * 30 + 2),
        today_profit: Math.random() * 50 - 10,
        week_profit: Math.random() * 200 - 40,
        month_profit: Math.random() * 800 - 150
      };

      // Рассчитываем производные значения
      mockStats.win_rate = (mockStats.winning_trades / mockStats.total_trades) * 100;
      mockStats.avg_profit_per_trade = mockStats.total_profit_usd / mockStats.total_trades;

      setStats(mockStats);
      
    } catch (error) {
      console.error('Error loading profit stats:', error);
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось загрузить статистику прибыли",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}$${amount.toFixed(2)}`;
  };

  const formatPercent = (percent: number) => {
    return `${percent.toFixed(1)}%`;
  };

  const getProfitColor = (amount: number) => {
    if (amount > 0) return 'text-green-600';
    if (amount < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getProfitBadgeVariant = (amount: number) => {
    if (amount > 0) return 'default';
    if (amount < 0) return 'destructive';
    return 'secondary';
  };

  if (!user) {
    return null;
  }

  return (
    <Card className="border-blue-500/20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            {title} - Статистика PNL
          </div>
          <Button
            onClick={loadProfitStats}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
        <CardDescription>
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Общая статистика */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-blue-500/10 rounded-lg">
            <p className={`text-2xl font-bold ${getProfitColor(stats.total_profit_usd)}`}>
              {formatCurrency(stats.total_profit_usd)}
            </p>
            <p className="text-sm text-muted-foreground">Общая прибыль</p>
          </div>
          
          <div className="text-center p-3 bg-purple-500/10 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">{stats.total_trades}</p>
            <p className="text-sm text-muted-foreground">Всего сделок</p>
          </div>
          
          <div className="text-center p-3 bg-green-500/10 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{formatPercent(stats.win_rate)}</p>
            <p className="text-sm text-muted-foreground">Винрейт</p>
          </div>
          
          <div className="text-center p-3 bg-orange-500/10 rounded-lg">
            <p className={`text-2xl font-bold ${getProfitColor(stats.avg_profit_per_trade)}`}>
              {formatCurrency(stats.avg_profit_per_trade)}
            </p>
            <p className="text-sm text-muted-foreground">Средняя сделка</p>
          </div>
        </div>

        {/* Детальная статистика */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Сделки */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Target className="h-4 w-4" />
              Анализ сделок
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Прибыльные сделки:</span>
                <Badge variant="default" className="bg-green-500">
                  {stats.winning_trades} ({formatPercent((stats.winning_trades / stats.total_trades) * 100)})
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Убыточные сделки:</span>
                <Badge variant="destructive">
                  {stats.losing_trades} ({formatPercent((stats.losing_trades / stats.total_trades) * 100)})
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Лучшая сделка:</span>
                <span className="text-sm font-semibold text-green-600">
                  {formatCurrency(stats.best_trade)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Худшая сделка:</span>
                <span className="text-sm font-semibold text-red-600">
                  {formatCurrency(stats.worst_trade)}
                </span>
              </div>
            </div>
          </div>

          {/* Временные периоды */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Прибыль по периодам
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Сегодня:</span>
                <Badge variant={getProfitBadgeVariant(stats.today_profit)}>
                  {formatCurrency(stats.today_profit)}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">За неделю:</span>
                <Badge variant={getProfitBadgeVariant(stats.week_profit)}>
                  {formatCurrency(stats.week_profit)}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">За месяц:</span>
                <Badge variant={getProfitBadgeVariant(stats.month_profit)}>
                  {formatCurrency(stats.month_profit)}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Индикатор производительности */}
        <div className="mt-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Производительность бота</h4>
              <p className="text-sm text-muted-foreground">
                {stats.win_rate >= 60 ? '🚀 Отличная' : 
                 stats.win_rate >= 40 ? '📈 Хорошая' : 
                 '⚠️ Требует оптимизации'} производительность
              </p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${getProfitColor(stats.total_profit_usd)}`}>
                {formatCurrency(stats.total_profit_usd)}
              </p>
              <p className="text-sm text-muted-foreground">
                {stats.total_trades} сделок
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BotProfitDisplay;