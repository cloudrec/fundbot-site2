import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Settings, Save, Clock, DollarSign, TrendingUp, Zap } from 'lucide-react';

interface TradingConfig {
  id?: string;
  exchange: string;
  symbol: string;
  order_amount_usd: number;
  leverage: number;
  take_profit_percent: number;
  stop_loss_percent: number;
  funding_delay_ms: number;
  order_timeout_minutes: number;
  is_enabled: boolean;
  telegram_notifications: boolean;
  entry_direction: 'short_first' | 'long_first';
}

const EXCHANGES = [
  { value: 'bybit', label: 'Bybit', icon: '🟡' },
  { value: 'binance', label: 'Binance', icon: '🟨' },
  { value: 'gate', label: 'Gate.io', icon: '🟦' },
  { value: 'kucoin', label: 'KuCoin', icon: '🟩' },
  { value: 'okx', label: 'OKX', icon: '⚫' },
  { value: 'mexc', label: 'MEXC', icon: '🔵' }
];

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

interface Props {
  selectedExchange: string;
  onExchangeChange: (exchange: string) => void;
}

export default function TradingConfigManager({ selectedExchange, onExchangeChange }: Props) {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<Record<string, TradingConfig>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadConfigs();
    }
  }, [user]);

  const loadConfigs = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('trading_configs')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const configsMap: Record<string, TradingConfig> = {};
      data?.forEach(config => {
        configsMap[config.exchange] = config;
      });
      setConfigs(configsMap);
    } catch (error: any) {
      console.error('Ошибка загрузки конфигураций:', error);
    }
  };

  const currentConfig = configs[selectedExchange] || {
    exchange: selectedExchange,
    symbol: 'BTCUSDT',
    order_amount_usd: 100,
    leverage: 10,
    take_profit_percent: 0.3,
    stop_loss_percent: 2.0,
    funding_delay_ms: 5000,
    order_timeout_minutes: 30,
    is_enabled: true,
    telegram_notifications: true,
    entry_direction: 'short_first' as const
  };

  const updateConfig = async (updates: Partial<TradingConfig>) => {
    if (!user) return;

    setLoading(true);
    try {
      const configData = {
        user_id: user.id,
        exchange: selectedExchange,
        ...currentConfig,
        ...updates
      };

      const { data, error } = await supabase
        .from('trading_configs')
        .upsert(configData)
        .select()
        .single();

      if (error) throw error;

      setConfigs(prev => ({
        ...prev,
        [selectedExchange]: data
      }));

      toast({
        title: "Настройки сохранены",
        description: `Конфигурация для ${selectedExchange} обновлена`,
      });
    } catch (error: any) {
      toast({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getNextFundingTime = () => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    return nextHour.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="space-y-6">
      {/* Exchange Selector */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Выбор биржи</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {EXCHANGES.map(exchange => (
              <Button
                key={exchange.value}
                variant={selectedExchange === exchange.value ? "default" : "outline"}
                onClick={() => onExchangeChange(exchange.value)}
                className="flex items-center space-x-2 h-12"
              >
                <span className="text-lg">{exchange.icon}</span>
                <span>{exchange.label}</span>
                {configs[exchange.value]?.is_enabled && (
                  <Badge variant="secondary" className="ml-auto bg-green-600 text-xs">ON</Badge>
                )}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Trading Configuration */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-lg">{EXCHANGES.find(e => e.value === selectedExchange)?.icon}</span>
              <span>Настройки для {EXCHANGES.find(e => e.value === selectedExchange)?.label}</span>
            </div>
            <Badge variant={currentConfig.is_enabled ? "default" : "secondary"}>
              {currentConfig.is_enabled ? "Активен" : "Остановлен"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Конфигурация торгового бота для фандинг-арбитража
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Основные параметры */}
            <div className="space-y-4">
              <h3 className="font-semibold text-blue-400 flex items-center space-x-2">
                <DollarSign className="h-4 w-4" />
                <span>Основные параметры</span>
              </h3>
              
              <div>
                <Label htmlFor="symbol">Торговая пара</Label>
                <Select 
                  value={currentConfig.symbol} 
                  onValueChange={(value) => updateConfig({ symbol: value })}
                >
                  <SelectTrigger className="bg-gray-700 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 border-gray-600">
                    {SYMBOLS.map(symbol => (
                      <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="amount">Размер ордера (USD)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={currentConfig.order_amount_usd}
                  onChange={(e) => updateConfig({ order_amount_usd: parseFloat(e.target.value) })}
                  className="bg-gray-700 border-gray-600"
                  min="10"
                  max="10000"
                />
                <p className="text-xs text-gray-400 mt-1">Минимум: $10, Максимум: $10,000</p>
              </div>

              <div>
                <Label htmlFor="leverage">Кредитное плечо</Label>
                <Input
                  id="leverage"
                  type="number"
                  value={currentConfig.leverage}
                  onChange={(e) => updateConfig({ leverage: parseInt(e.target.value) })}
                  className="bg-gray-700 border-gray-600"
                  min="1"
                  max="100"
                />
                <p className="text-xs text-gray-400 mt-1">Рекомендуется: 5-20x</p>
              </div>
            </div>

            {/* Управление рисками */}
            <div className="space-y-4">
              <h3 className="font-semibold text-red-400 flex items-center space-x-2">
                <TrendingUp className="h-4 w-4" />
                <span>Управление рисками</span>
              </h3>

              <div>
                <Label htmlFor="tp">Тейк-профит (%)</Label>
                <Input
                  id="tp"
                  type="number"
                  step="0.1"
                  value={currentConfig.take_profit_percent}
                  onChange={(e) => updateConfig({ take_profit_percent: parseFloat(e.target.value) })}
                  className="bg-gray-700 border-gray-600"
                  min="0.1"
                  max="5"
                />
                <p className="text-xs text-gray-400 mt-1">Рекомендуется: 0.2-0.5%</p>
              </div>

              <div>
                <Label htmlFor="sl">Стоп-лосс (%)</Label>
                <Input
                  id="sl"
                  type="number"
                  step="0.1"
                  value={currentConfig.stop_loss_percent}
                  onChange={(e) => updateConfig({ stop_loss_percent: parseFloat(e.target.value) })}
                  className="bg-gray-700 border-gray-600"
                  min="0.5"
                  max="10"
                />
                <p className="text-xs text-gray-400 mt-1">Рекомендуется: 1-3%</p>
              </div>

              <div>
                <Label htmlFor="direction">Направление входа</Label>
                <Select 
                  value={currentConfig.entry_direction} 
                  onValueChange={(value: 'short_first' | 'long_first') => updateConfig({ entry_direction: value })}
                >
                  <SelectTrigger className="bg-gray-700 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 border-gray-600">
                    <SelectItem value="short_first">Сначала шорт (рекомендуется)</SelectItem>
                    <SelectItem value="long_first">Сначала лонг</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Временные параметры */}
          <div className="border-t border-gray-700 pt-6">
            <h3 className="font-semibold text-yellow-400 flex items-center space-x-2 mb-4">
              <Clock className="h-4 w-4" />
              <span>Временные параметры</span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="delay">Задержка после фандинга (мс)</Label>
                <Input
                  id="delay"
                  type="number"
                  value={currentConfig.funding_delay_ms}
                  onChange={(e) => updateConfig({ funding_delay_ms: parseInt(e.target.value) })}
                  className="bg-gray-700 border-gray-600"
                  min="1000"
                  max="30000"
                />
                <p className="text-xs text-gray-400 mt-1">Рекомендуется: 3000-8000 мс</p>
              </div>

              <div>
                <Label htmlFor="timeout">Таймаут ордера (мин)</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={currentConfig.order_timeout_minutes}
                  onChange={(e) => updateConfig({ order_timeout_minutes: parseInt(e.target.value) })}
                  className="bg-gray-700 border-gray-600"
                  min="5"
                  max="120"
                />
                <p className="text-xs text-gray-400 mt-1">Время до отмены неисполненного ордера</p>
              </div>
            </div>
          </div>

          {/* Переключатели */}
          <div className="border-t border-gray-700 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enabled">Включить торговлю</Label>
                  <p className="text-sm text-gray-400">Активировать бота для этой биржи</p>
                </div>
                <Switch
                  id="enabled"
                  checked={currentConfig.is_enabled}
                  onCheckedChange={(checked) => updateConfig({ is_enabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notifications">Telegram уведомления</Label>
                  <p className="text-sm text-gray-400">Получать уведомления о сделках</p>
                </div>
                <Switch
                  id="notifications"
                  checked={currentConfig.telegram_notifications}
                  onCheckedChange={(checked) => updateConfig({ telegram_notifications: checked })}
                />
              </div>
            </div>
          </div>

          {/* Информация о фандинге */}
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-blue-400 flex items-center space-x-2">
                  <Zap className="h-4 w-4" />
                  <span>Следующий фандинг</span>
                </h4>
                <p className="text-sm text-gray-300">Бот автоматически войдет в позицию</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-mono text-blue-400">{getNextFundingTime()}</p>
                <p className="text-xs text-gray-400">Каждый час в :00</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
