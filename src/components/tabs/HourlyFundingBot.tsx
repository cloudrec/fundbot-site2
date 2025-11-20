import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Play, Square, Settings, TrendingUp, Clock, DollarSign, Shield, Zap, BarChart3 } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface FundingRate {
  id: string;
  symbol: string;
  exchange: string;
  funding_rate: number;
  next_funding_time: string;
  mark_price: number;
  volume_24h: number;
  liquidity_score: number;
  rate_rank: number;
}

interface FundingPosition {
  id: string;
  symbol: string;
  exchange: string;
  side: string;
  size: number;
  entry_price: number;
  expected_funding_rate: number;
  status: string;
  pnl: number;
  funding_pnl: number;
  total_pnl: number;
  hedge_exchange?: string;
  hedge_side?: string;
}

interface BotSettings {
  bot_enabled: boolean;
  min_funding_rate: number;
  position_size_usdt: number;
  position_size_percent: number;
  use_percent_size: boolean;
  max_positions: number;
  entry_time_seconds: number;
  hedging_enabled: boolean;
  hedge_exchanges: string[];
  dynamic_stops_enabled: boolean;
  stop_loss_percent: number;
  take_profit_percent: number;
  max_position_time_minutes: number;
  allowed_pairs: string[];
  min_liquidity_usdt: number;
  max_spread_percent: number;
  exchange_priority: string[];
  telegram_enabled: boolean;
  telegram_all_events: boolean;
  logging_enabled: boolean;
  volatility_multiplier: number;
  funding_confirmation_timeout: number;
  emergency_exit_enabled: boolean;
}

const HourlyFundingBot: React.FC = () => {
  const { toast } = useToast();
  
  // Состояния
  const [settings, setSettings] = useState<BotSettings>({
    bot_enabled: false,
    min_funding_rate: 0.01,
    position_size_usdt: 100,
    position_size_percent: 1,
    use_percent_size: false,
    max_positions: 3,
    entry_time_seconds: 30,
    hedging_enabled: true,
    hedge_exchanges: ['binance', 'bybit'],
    dynamic_stops_enabled: true,
    stop_loss_percent: 0.5,
    take_profit_percent: 0.1,
    max_position_time_minutes: 10,
    allowed_pairs: ['BTC', 'ETH', 'BNB', 'SOL'],
    min_liquidity_usdt: 1000000,
    max_spread_percent: 0.1,
    exchange_priority: ['binance', 'bybit', 'okx', 'kucoin'],
    telegram_enabled: true,
    telegram_all_events: false,
    logging_enabled: true,
    volatility_multiplier: 1.5,
    funding_confirmation_timeout: 60,
    emergency_exit_enabled: true
  });

  const [fundingRates, setFundingRates] = useState<FundingRate[]>([]);
  const [activePositions, setActivePositions] = useState<FundingPosition[]>([]);
  const [botStatus, setBotStatus] = useState({
    stage: 'waiting',
    secondsToFunding: 0,
    nextAction: '',
    message: ''
  });
  const [statistics, setStatistics] = useState({
    totalTrades: 0,
    totalPnl: '0.00',
    winRate: '0.0',
    recentTrades: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Загрузка настроек при монтировании
  useEffect(() => {
    loadSettings();
    loadBotStatus();
    loadStatistics();
    
    // Автообновление каждые 10 секунд
    const interval = setInterval(() => {
      if (settings.bot_enabled) {
        loadBotStatus();
        loadActivePositions();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [settings.bot_enabled]);

  // Загрузка настроек из базы данных
  const loadSettings = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('funding_bot_settings_2025_11_16_15_00')
        .select('*')
        .eq('user_id', user.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Ошибка загрузки настроек:', error);
        return;
      }

      if (data) {
        setSettings(prev => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
    }
  };

  // Сохранение настроек
  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast({
          title: "Ошибка",
          description: "Пользователь не авторизован",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from('funding_bot_settings_2025_11_16_15_00')
        .upsert({
          user_id: user.user.id,
          ...settings
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Успешно",
        description: "Настройки сохранены",
      });
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить настройки",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Загрузка статуса бота
  const loadBotStatus = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase.functions.invoke('automatic_funding_bot_2025_11_16_15_00', {
        body: {
          action: 'get_status',
          userId: user.user.id
        }
      });

      if (error) {
        console.error('Ошибка получения статуса:', error);
        return;
      }

      if (data) {
        setBotStatus(prev => ({
          ...prev,
          ...data
        }));
      }
    } catch (error) {
      console.error('Ошибка загрузки статуса:', error);
    }
  };

  // Загрузка активных позиций
  const loadActivePositions = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('funding_positions_2025_11_16_15_00')
        .select('*')
        .eq('user_id', user.user.id)
        .in('status', ['active', 'monitoring'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Ошибка загрузки позиций:', error);
        return;
      }

      setActivePositions(data || []);
    } catch (error) {
      console.error('Ошибка загрузки позиций:', error);
    }
  };

  // Загрузка статистики
  const loadStatistics = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase.functions.invoke('automatic_funding_bot_2025_11_16_15_00', {
        body: {
          action: 'get_statistics',
          userId: user.user.id
        }
      });

      if (error) {
        console.error('Ошибка получения статистики:', error);
        return;
      }

      if (data && data.statistics) {
        setStatistics(data.statistics);
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }
  };

  // Запуск/остановка бота
  const toggleBot = async () => {
    setIsLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast({
          title: "Ошибка",
          description: "Пользователь не авторизован",
          variant: "destructive",
        });
        return;
      }

      const action = settings.bot_enabled ? 'stop_bot' : 'start_bot';
      
      const { data, error } = await supabase.functions.invoke('automatic_funding_bot_2025_11_16_15_00', {
        body: {
          action: action,
          userId: user.user.id,
          settings: settings
        }
      });

      if (error) {
        throw error;
      }

      setSettings(prev => ({ ...prev, bot_enabled: !prev.bot_enabled }));
      
      toast({
        title: "Успешно",
        description: settings.bot_enabled ? "Фандинг-бот остановлен" : "Фандинг-бот запущен",
      });

      // Сохраняем изменения
      await saveSettings();
      
    } catch (error) {
      console.error('Ошибка управления ботом:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось изменить состояние бота",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Сканирование фандинг ставок
  const scanFundingRates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('hourly_funding_scanner_2025_11_16_15_00', {
        body: {
          action: 'scan',
          minFundingRate: settings.min_funding_rate,
          allowedPairs: settings.allowed_pairs,
          minLiquidity: settings.min_liquidity_usdt,
          maxSpread: settings.max_spread_percent
        }
      });

      if (error) {
        throw error;
      }

      setFundingRates(data.fundingRates || []);
      
      toast({
        title: "Сканирование завершено",
        description: `Найдено ${data.totalFound} фандинг возможностей`,
      });
      
    } catch (error) {
      console.error('Ошибка сканирования:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось выполнить сканирование",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Аварийный выход
  const emergencyExit = async () => {
    if (!confirm('Вы уверены, что хотите закрыть все позиции?')) return;
    
    setIsLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase.functions.invoke('funding_position_manager_2025_11_16_15_00', {
        body: {
          action: 'emergency_exit',
          userId: user.user.id
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Аварийный выход",
        description: "Все позиции закрыты",
      });

      loadActivePositions();
      
    } catch (error) {
      console.error('Ошибка аварийного выхода:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось выполнить аварийный выход",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Форматирование времени до фандинга
  const formatTimeToFunding = (seconds: number) => {
    if (seconds <= 0) return 'Фандинг прошел';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}м ${secs}с`;
  };

  // Получение цвета статуса
  const getStatusColor = (stage: string) => {
    switch (stage) {
      case 'scanning': return 'bg-blue-500';
      case 'preparing': return 'bg-yellow-500';
      case 'entering': return 'bg-green-500';
      case 'monitoring': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Заголовок и статус */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">💰 Почасовой Фандинг-Бот</h2>
          <p className="text-muted-foreground">
            Автоматическое получение фандинга каждый час с хеджированием
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant={settings.bot_enabled ? "default" : "secondary"} className="text-sm">
            {settings.bot_enabled ? "🟢 АКТИВЕН" : "🔴 ОСТАНОВЛЕН"}
          </Badge>
          <Button
            onClick={toggleBot}
            disabled={isLoading}
            variant={settings.bot_enabled ? "destructive" : "default"}
            size="lg"
          >
            {settings.bot_enabled ? <Square className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {settings.bot_enabled ? "Остановить" : "Запустить"}
          </Button>
        </div>
      </div>

      {/* Статус бота */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Статус Бота
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`w-3 h-3 rounded-full ${getStatusColor(botStatus.stage)} mx-auto mb-2`}></div>
              <p className="text-sm font-medium">Этап</p>
              <p className="text-xs text-muted-foreground">{botStatus.stage}</p>
            </div>
            <div className="text-center">
              <Clock className="w-6 h-6 mx-auto mb-2 text-blue-500" />
              <p className="text-sm font-medium">До фандинга</p>
              <p className="text-xs text-muted-foreground">{formatTimeToFunding(botStatus.secondsToFunding)}</p>
            </div>
            <div className="text-center">
              <TrendingUp className="w-6 h-6 mx-auto mb-2 text-green-500" />
              <p className="text-sm font-medium">Активные позиции</p>
              <p className="text-xs text-muted-foreground">{activePositions.length}</p>
            </div>
            <div className="text-center">
              <DollarSign className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
              <p className="text-sm font-medium">Общий PnL</p>
              <p className="text-xs text-muted-foreground">{statistics.totalPnl} USDT</p>
            </div>
          </div>
          {botStatus.message && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-sm">{botStatus.message}</p>
              {botStatus.nextAction && (
                <p className="text-xs text-muted-foreground mt-1">{botStatus.nextAction}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Основные вкладки */}
      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="settings">⚙️ Настройки</TabsTrigger>
          <TabsTrigger value="positions">📊 Позиции</TabsTrigger>
          <TabsTrigger value="rates">💰 Фандинг</TabsTrigger>
          <TabsTrigger value="statistics">📈 Статистика</TabsTrigger>
          <TabsTrigger value="advanced">🔧 Продвинутые</TabsTrigger>
        </TabsList>

        {/* Настройки */}
        <TabsContent value="settings" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Основные настройки */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Основные настройки
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="min_funding_rate">Минимальный фандинг (%)</Label>
                    <Input
                      id="min_funding_rate"
                      type="text"
                      value={settings.min_funding_rate}
                      onChange={(e) => setSettings(prev => ({ ...prev, min_funding_rate: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="max_positions">Максимум позиций</Label>
                    <Input
                      id="max_positions"
                      type="number"
                      min="1"
                      max="10"
                      value={settings.max_positions}
                      onChange={(e) => setSettings(prev => ({ ...prev, max_positions: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <Switch
                      id="use_percent_size"
                      checked={settings.use_percent_size}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, use_percent_size: checked }))}
                    />
                    <Label htmlFor="use_percent_size">Использовать % от депозита</Label>
                  </div>
                  
                  {settings.use_percent_size ? (
                    <div>
                      <Label htmlFor="position_size_percent">Размер позиции (%)</Label>
                      <Input
                        id="position_size_percent"
                        type="text"
                        value={settings.position_size_percent}
                        onChange={(e) => setSettings(prev => ({ ...prev, position_size_percent: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="position_size_usdt">Размер позиции (USDT)</Label>
                      <Input
                        id="position_size_usdt"
                        type="text"
                        value={settings.position_size_usdt}
                        onChange={(e) => setSettings(prev => ({ ...prev, position_size_usdt: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="entry_time_seconds">Время входа до фандинга (сек)</Label>
                  <Input
                    id="entry_time_seconds"
                    type="number"
                    min="10"
                    max="300"
                    value={settings.entry_time_seconds}
                    onChange={(e) => setSettings(prev => ({ ...prev, entry_time_seconds: parseInt(e.target.value) || 30 }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Управление рисками */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Управление рисками
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="hedging_enabled"
                    checked={settings.hedging_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, hedging_enabled: checked }))}
                  />
                  <Label htmlFor="hedging_enabled">Включить хеджирование</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="dynamic_stops_enabled"
                    checked={settings.dynamic_stops_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, dynamic_stops_enabled: checked }))}
                  />
                  <Label htmlFor="dynamic_stops_enabled">Динамические стопы</Label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="stop_loss_percent">Стоп-лосс (%)</Label>
                    <Input
                      id="stop_loss_percent"
                      type="text"
                      value={settings.stop_loss_percent}
                      onChange={(e) => setSettings(prev => ({ ...prev, stop_loss_percent: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="take_profit_percent">Тейк-профит (%)</Label>
                    <Input
                      id="take_profit_percent"
                      type="text"
                      value={settings.take_profit_percent}
                      onChange={(e) => setSettings(prev => ({ ...prev, take_profit_percent: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="max_position_time_minutes">Максимальное время в позиции (мин)</Label>
                  <Input
                    id="max_position_time_minutes"
                    type="number"
                    min="1"
                    max="60"
                    value={settings.max_position_time_minutes}
                    onChange={(e) => setSettings(prev => ({ ...prev, max_position_time_minutes: parseInt(e.target.value) || 10 }))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-4">
            <Button onClick={saveSettings} disabled={isSaving}>
              {isSaving ? "Сохранение..." : "💾 Сохранить настройки"}
            </Button>
          </div>
        </TabsContent>

        {/* Активные позиции */}
        <TabsContent value="positions" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Активные позиции ({activePositions.length})</h3>
            <div className="flex gap-2">
              <Button onClick={loadActivePositions} variant="outline" size="sm">
                🔄 Обновить
              </Button>
              {activePositions.length > 0 && (
                <Button onClick={emergencyExit} variant="destructive" size="sm">
                  🚨 Аварийный выход
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            {activePositions.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">Нет активных позиций</p>
                </CardContent>
              </Card>
            ) : (
              activePositions.map((position) => (
                <Card key={position.id}>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                      <div>
                        <p className="text-sm font-medium">{position.symbol}</p>
                        <p className="text-xs text-muted-foreground">{position.exchange.toUpperCase()}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{position.side.toUpperCase()}</p>
                        <p className="text-xs text-muted-foreground">{position.size} USDT</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">${position.entry_price.toFixed(4)}</p>
                        <p className="text-xs text-muted-foreground">Вход</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{position.expected_funding_rate > 0 ? '+' : ''}{position.expected_funding_rate.toFixed(4)}%</p>
                        <p className="text-xs text-muted-foreground">Фандинг</p>
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${position.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {position.total_pnl >= 0 ? '+' : ''}{position.total_pnl.toFixed(2)} USDT
                        </p>
                        <p className="text-xs text-muted-foreground">PnL</p>
                      </div>
                      <div>
                        <Badge variant={position.status === 'active' ? 'default' : 'secondary'}>
                          {position.status}
                        </Badge>
                        {position.hedge_exchange && (
                          <p className="text-xs text-muted-foreground mt-1">🛡️ {position.hedge_exchange}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Фандинг ставки */}
        <TabsContent value="rates" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Фандинг ставки ({fundingRates.length})</h3>
            <Button onClick={scanFundingRates} disabled={isLoading}>
              {isLoading ? "Сканирование..." : "🔍 Сканировать"}
            </Button>
          </div>

          <div className="grid gap-2">
            {fundingRates.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">Нажмите "Сканировать" для поиска фандинг ставок</p>
                </CardContent>
              </Card>
            ) : (
              fundingRates.slice(0, 20).map((rate, index) => (
                <Card key={`${rate.exchange}-${rate.symbol}`} className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-center">
                    <div>
                      <p className="font-medium">{rate.symbol}</p>
                      <p className="text-xs text-muted-foreground">{rate.exchange.toUpperCase()}</p>
                    </div>
                    <div>
                      <p className={`font-medium ${rate.funding_rate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {rate.funding_rate >= 0 ? '+' : ''}{rate.funding_rate.toFixed(4)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Ставка</p>
                    </div>
                    <div>
                      <p className="text-sm">${rate.mark_price?.toFixed(4) || 'N/A'}</p>
                      <p className="text-xs text-muted-foreground">Цена</p>
                    </div>
                    <div>
                      <p className="text-sm">${(rate.volume_24h / 1000000).toFixed(1)}M</p>
                      <p className="text-xs text-muted-foreground">Объем 24ч</p>
                    </div>
                    <div>
                      <p className="text-sm">{(rate.liquidity_score * 100).toFixed(0)}%</p>
                      <p className="text-xs text-muted-foreground">Ликвидность</p>
                    </div>
                    <div>
                      <Badge variant="outline">#{rate.rate_rank}</Badge>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Статистика */}
        <TabsContent value="statistics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <BarChart3 className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                  <p className="text-2xl font-bold">{statistics.totalTrades}</p>
                  <p className="text-sm text-muted-foreground">Всего сделок</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className={`text-2xl font-bold ${parseFloat(statistics.totalPnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {parseFloat(statistics.totalPnl) >= 0 ? '+' : ''}{statistics.totalPnl} USDT
                  </p>
                  <p className="text-sm text-muted-foreground">Общий PnL</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                  <p className="text-2xl font-bold">{statistics.winRate}%</p>
                  <p className="text-sm text-muted-foreground">Винрейт</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Последние сделки</CardTitle>
            </CardHeader>
            <CardContent>
              {statistics.recentTrades.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">Нет данных о сделках</p>
              ) : (
                <div className="space-y-2">
                  {statistics.recentTrades.map((trade: any, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">{trade.symbol} {trade.side.toUpperCase()}</p>
                        <p className="text-xs text-muted-foreground">{trade.exchange.toUpperCase()} • {new Date(trade.exit_time).toLocaleString('ru-RU')}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${trade.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {trade.total_pnl >= 0 ? '+' : ''}{trade.total_pnl.toFixed(2)} USDT
                        </p>
                        <p className="text-xs text-muted-foreground">{trade.exit_reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Продвинутые настройки */}
        <TabsContent value="advanced" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Фильтры и ограничения */}
            <Card>
              <CardHeader>
                <CardTitle>Фильтры и ограничения</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="allowed_pairs">Разрешенные пары (через запятую)</Label>
                  <Input
                    id="allowed_pairs"
                    value={settings.allowed_pairs.join(', ')}
                    onChange={(e) => setSettings(prev => ({ 
                      ...prev, 
                      allowed_pairs: e.target.value.split(',').map(s => s.trim()).filter(s => s) 
                    }))}
                    placeholder="BTC, ETH, BNB, SOL"
                  />
                </div>

                <div>
                  <Label htmlFor="min_liquidity_usdt">Минимальная ликвидность (USDT)</Label>
                  <Input
                    id="min_liquidity_usdt"
                    type="text"
                    value={settings.min_liquidity_usdt}
                    onChange={(e) => setSettings(prev => ({ ...prev, min_liquidity_usdt: parseFloat(e.target.value) || 0 }))}
                  />
                </div>

                <div>
                  <Label htmlFor="max_spread_percent">Максимальный спред (%)</Label>
                  <Input
                    id="max_spread_percent"
                    type="text"
                    value={settings.max_spread_percent}
                    onChange={(e) => setSettings(prev => ({ ...prev, max_spread_percent: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Уведомления и мониторинг */}
            <Card>
              <CardHeader>
                <CardTitle>Уведомления и мониторинг</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="telegram_enabled"
                    checked={settings.telegram_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, telegram_enabled: checked }))}
                  />
                  <Label htmlFor="telegram_enabled">Telegram уведомления</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="telegram_all_events"
                    checked={settings.telegram_all_events}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, telegram_all_events: checked }))}
                  />
                  <Label htmlFor="telegram_all_events">Все события (не только важные)</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="logging_enabled"
                    checked={settings.logging_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, logging_enabled: checked }))}
                  />
                  <Label htmlFor="logging_enabled">Подробное логирование</Label>
                </div>

                <div>
                  <Label htmlFor="volatility_multiplier">Множитель волатильности</Label>
                  <Input
                    id="volatility_multiplier"
                    type="text"
                    value={settings.volatility_multiplier}
                    onChange={(e) => setSettings(prev => ({ ...prev, volatility_multiplier: parseFloat(e.target.value) || 1.5 }))}
                  />
                </div>

                <div>
                  <Label htmlFor="funding_confirmation_timeout">Таймаут подтверждения фандинга (сек)</Label>
                  <Input
                    id="funding_confirmation_timeout"
                    type="number"
                    min="30"
                    max="300"
                    value={settings.funding_confirmation_timeout}
                    onChange={(e) => setSettings(prev => ({ ...prev, funding_confirmation_timeout: parseInt(e.target.value) || 60 }))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={isSaving}>
              {isSaving ? "Сохранение..." : "💾 Сохранить продвинутые настройки"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HourlyFundingBot;
