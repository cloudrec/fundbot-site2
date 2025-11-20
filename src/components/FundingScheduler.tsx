import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Clock, 
  Play, 
  Pause, 
  RefreshCw, 
  Timer, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  Bot,
  Zap
} from 'lucide-react';

interface SchedulerStatus {
  success: boolean;
  message: string;
  totalSecondsToFunding?: number;
  minutesToFunding?: number;
  secondsToFunding?: number;
  willTriggerIn?: number;
  activeExchanges?: string[];
  nextFundingTime?: string;
  settings?: {
    enabled: boolean;
    strategy: string;
    positionSize: number;
    minFundingRate: number;
  };
  results?: Array<{
    exchange: string;
    success: boolean;
    error?: string;
    orderType: string;
  }>;
}

const FundingScheduler: React.FC = () => {
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { toast } = useToast();

  // Автоматическое обновление каждые 10 секунд
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isAutoMode) {
      checkSchedulerStatus(); // Первоначальная проверка
      interval = setInterval(() => {
        checkSchedulerStatus();
      }, 10000); // Каждые 10 секунд
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAutoMode]);

  const checkSchedulerStatus = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('funding_scheduler_v41_2025_11_09_23_05', {
        body: {}
      });

      if (error) {
        throw error;
      }

      setSchedulerStatus(data);
      setLastUpdate(new Date());

      // Если бот запустился, показываем уведомление
      if (data.results && data.results.length > 0) {
        const successCount = data.results.filter((r: any) => r.success).length;
        toast({
          title: "🤖 Фандинг-бот запущен!",
          description: `Успешно: ${successCount}/${data.results.length} ордеров`,
          duration: 5000,
        });
      }

    } catch (error: any) {
      console.error('Ошибка проверки планировщика:', error);
      toast({
        title: "Ошибка планировщика",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAutoMode = () => {
    setIsAutoMode(!isAutoMode);
    if (!isAutoMode) {
      toast({
        title: "Автоматический режим включен",
        description: "Планировщик будет проверять время фандинга каждые 10 секунд",
      });
    } else {
      toast({
        title: "Автоматический режим выключен",
        description: "Планировщик остановлен",
      });
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}м ${remainingSeconds}с`;
  };

  const getStatusColor = () => {
    if (!schedulerStatus) return 'gray';
    if (schedulerStatus.results && schedulerStatus.results.length > 0) return 'green';
    if (schedulerStatus.willTriggerIn && schedulerStatus.willTriggerIn <= 120) return 'yellow';
    return 'blue';
  };

  const getStatusIcon = () => {
    if (!schedulerStatus) return <Clock className="h-5 w-5" />;
    if (schedulerStatus.results && schedulerStatus.results.length > 0) return <CheckCircle className="h-5 w-5" />;
    if (schedulerStatus.willTriggerIn && schedulerStatus.willTriggerIn <= 120) return <Zap className="h-5 w-5" />;
    return <Timer className="h-5 w-5" />;
  };

  return (
    <div className="space-y-6">
      {/* Основная карточка планировщика */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bot className="h-6 w-6 text-blue-600" />
              <CardTitle>Автоматический планировщик фандинг-бота</CardTitle>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={isAutoMode}
                onCheckedChange={toggleAutoMode}
                id="auto-mode"
              />
              <Label htmlFor="auto-mode" className="text-sm">
                Авто-режим
              </Label>
            </div>
          </div>
          <CardDescription>
            Автоматический запуск сделок за 2 минуты до начисления фандинга
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Статус и кнопки управления */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Badge variant={getStatusColor() === 'green' ? 'default' : 'secondary'} className="flex items-center space-x-1">
                {getStatusIcon()}
                <span>
                  {isAutoMode ? 'Активен' : 'Остановлен'}
                </span>
              </Badge>
              {lastUpdate && (
                <span className="text-sm text-gray-500">
                  Обновлено: {lastUpdate.toLocaleTimeString()}
                </span>
              )}
            </div>
            
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={checkSchedulerStatus}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Проверить
              </Button>
            </div>
          </div>

          {/* Информация о времени */}
          {schedulerStatus && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {schedulerStatus.minutesToFunding || 0}м {schedulerStatus.secondsToFunding || 0}с
                  </div>
                  <div className="text-sm text-gray-500">До фандинга</div>
                </div>
              </Card>
              
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {schedulerStatus.willTriggerIn ? formatTime(schedulerStatus.willTriggerIn) : '—'}
                  </div>
                  <div className="text-sm text-gray-500">До запуска</div>
                </div>
              </Card>
              
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {schedulerStatus.activeExchanges?.length || 0}
                  </div>
                  <div className="text-sm text-gray-500">Активных бирж</div>
                </div>
              </Card>
              
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    ${schedulerStatus.settings?.positionSize || 0}
                  </div>
                  <div className="text-sm text-gray-500">Размер позиции</div>
                </div>
              </Card>
            </div>
          )}

          {/* Активные биржи */}
          {schedulerStatus?.activeExchanges && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Активные биржи:</Label>
              <div className="flex flex-wrap gap-2">
                {schedulerStatus.activeExchanges.map((exchange) => (
                  <Badge key={exchange} variant="outline">
                    {exchange.toUpperCase()}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Результаты последнего запуска */}
          {schedulerStatus?.results && schedulerStatus.results.length > 0 && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Результаты последнего запуска:</Label>
              <div className="space-y-2">
                {schedulerStatus.results.map((result, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center space-x-2">
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium">{result.exchange.toUpperCase()}</span>
                      <Badge variant={result.orderType === 'LONG' ? 'default' : 'secondary'}>
                        {result.orderType}
                      </Badge>
                    </div>
                    <div className="text-sm">
                      {result.success ? (
                        <span className="text-green-600">Успешно</span>
                      ) : (
                        <span className="text-red-600">{result.error}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Настройки бота */}
          {schedulerStatus?.settings && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Стратегия:</span> {schedulerStatus.settings.strategy}
                </div>
                <div>
                  <span className="font-medium">Мин. фандинг:</span> {schedulerStatus.settings.minFundingRate}%
                </div>
              </div>
            </div>
          )}

          {/* Сообщение статуса */}
          {schedulerStatus?.message && (
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
              {schedulerStatus.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Инструкции */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Как работает автоматический планировщик</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
            <div>
              <strong>Мониторинг времени:</strong> Планировщик отслеживает время до следующего начисления фандинга (каждый час в 00:00)
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
            <div>
              <strong>Автозапуск:</strong> За 2 минуты до фандинга автоматически запускаются сделки на всех активных биржах
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
            <div>
              <strong>Стратегия:</strong> Тип ордера (LONG/SHORT) определяется настройкой "entry_strategy" в фандинг-боте
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
            <div>
              <strong>Уведомления:</strong> Результаты отправляются в Telegram (если настроено) и отображаются здесь
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FundingScheduler;