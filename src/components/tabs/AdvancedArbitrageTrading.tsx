import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { TrendingUp, Settings, Eye, DollarSign, Play, AlertTriangle, Zap, Target, Save, Database, MessageSquare, TestTube, Shield } from 'lucide-react';

interface ArbitrageOpportunity {
  id: string;
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  volume24h: number;
  estimatedProfit: number;
  risk: string;
  status: string;
  priceConvergence?: {
    convergencePercentage: number;
    isConverging: boolean;
    trend: 'converging' | 'diverging' | 'stable';
  };
}

interface TradingSettings {
  autoTradingEnabled: boolean;
  autoScanningEnabled: boolean;
  leverage: number;
  tradeAmount: number;
  maxPositionSize: number;
  minSpread: number;
  minVolume: number;
  telegramEnabled: boolean;
  priceValidationThreshold: number;
  priceConvergenceThreshold: number;
  convergenceNotificationsEnabled: boolean;
  maxPriceDeviation: number; // НОВЫЙ ПАРАМЕТР
}

interface ActivePosition {
  id: string;
  symbol: string;
  status: string;
  entryTime: string;
  buyExchange: string;
  sellExchange: string;
  currentSpread: number;
  unrealizedPnL: number;
}

const AdvancedArbitrageTrading = () => {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>(() => {
    const saved = localStorage.getItem("arbitrage_opportunities");
    return saved ? JSON.parse(saved) : [];
  });
  const [activePositions, setActivePositions] = useState<ActivePosition[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [settings, setSettings] = useState<TradingSettings>({
    autoTradingEnabled: false,
    autoScanningEnabled: false,
    leverage: 1,
    tradeAmount: 1000,
    maxPositionSize: 1000,
    minSpread: 0.5,
    minVolume: 20000000,
    telegramEnabled: true,
    priceValidationThreshold: 0.2,
    priceConvergenceThreshold: 2.0,
    convergenceNotificationsEnabled: true,
    maxPriceDeviation: 25.0 // По умолчанию 25%
  });
  const [totalPnL, setTotalPnL] = useState(0);

  // Загружаем настройки из базы данных при загрузке компонента
  useEffect(() => {
    loadSettingsFromDatabase();
  }, []);

  // Автоматическое сканирование каждые 30 секунд если включено
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isScanning && settings.autoScanningEnabled) {
        scanArbitrageOpportunities();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isScanning, settings.autoScanningEnabled]);

  // Мониторинг активных позиций каждые 10 секунд
  useEffect(() => {
    const interval = setInterval(() => {
      monitorActivePositions();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const loadSettingsFromDatabase = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('arbitrage_settings_2025_11_16_06_40')
        .select('*')
        .eq('user_id', user.user.id)
        .single();

      if (data && !error) {
        setSettings({
          autoTradingEnabled: data.auto_trading_enabled,
          autoScanningEnabled: data.auto_scanning_enabled || false,
          leverage: data.leverage,
          tradeAmount: parseFloat(data.trade_amount),
          maxPositionSize: parseFloat(data.max_position_size),
          minSpread: parseFloat(data.min_spread),
          minVolume: data.min_volume,
          telegramEnabled: data.telegram_enabled,
          priceValidationThreshold: parseFloat(data.price_validation_threshold) || 0.2,
          priceConvergenceThreshold: parseFloat(data.price_convergence_threshold) || 2.0,
          convergenceNotificationsEnabled: data.convergence_notifications_enabled !== false,
          maxPriceDeviation: parseFloat(data.max_price_deviation) || 25.0
        });
        console.log('✅ Настройки загружены из базы данных');
      } else if (error && error.code !== 'PGRST116') {
        console.error('❌ Ошибка загрузки настроек:', error);
      }
    } catch (error) {
      console.error('❌ Ошибка подключения к базе данных:', error);
    }
  };

  const saveSettingsToDatabase = async () => {
    setIsSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast({
          title: 'Ошибка авторизации',
          description: 'Необходимо войти в систему для сохранения настроек',
          variant: 'destructive',
        });
        return;
      }

      const settingsData = {
        user_id: user.user.id,
        auto_trading_enabled: settings.autoTradingEnabled,
        auto_scanning_enabled: settings.autoScanningEnabled,
        leverage: settings.leverage,
        trade_amount: settings.tradeAmount,
        max_position_size: settings.maxPositionSize,
        min_spread: settings.minSpread,
        min_volume: settings.minVolume,
        telegram_enabled: settings.telegramEnabled,
        price_convergence_threshold: settings.priceConvergenceThreshold,
        convergence_notifications_enabled: settings.convergenceNotificationsEnabled,
        max_price_deviation: settings.maxPriceDeviation
      };

      // Пробуем обновить существующие настройки
      const { data: existingData } = await supabase
        .from('arbitrage_settings_2025_11_16_06_40')
        .select('id')
        .eq('user_id', user.user.id)
        .single();

      let result;
      if (existingData) {
        // Обновляем существующие настройки
        result = await supabase
          .from('arbitrage_settings_2025_11_16_06_40')
          .update(settingsData)
          .eq('user_id', user.user.id);
      } else {
        // Создаем новые настройки
        result = await supabase
          .from('arbitrage_settings_2025_11_16_06_40')
          .insert([settingsData]);
      }

      if (result.error) {
        throw result.error;
      }

      toast({
        title: 'Настройки сохранены',
        description: 'Настройки межбиржевого арбитража успешно сохранены в базу данных',
      });

      console.log('✅ Настройки сохранены в базу данных');
    } catch (error: any) {
      console.error('❌ Ошибка сохранения настроек:', error);
      toast({
        title: 'Ошибка сохранения',
        description: error.message || 'Не удалось сохранить настройки в базу данных',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const testTelegramNotifications = async () => {
    setIsTesting(true);
    try {
      console.log('📱 Тестирую Telegram уведомления...');
      
      const { data, error } = await supabase.functions.invoke('high_speed_arbitrage_scanner_2025_11_17_11_55', {
        body: { action: 'test_telegram', settings }
      });

      if (error) {
        console.error('❌ Ошибка тестирования Telegram:', error);
        toast({
          title: 'Ошибка тестирования Telegram',
          description: error.message || 'Не удалось протестировать Telegram уведомления',
          variant: 'destructive',
        });
      } else if (data) {
        toast({
          title: data.success ? 'Telegram работает!' : 'Ошибка Telegram',
          description: data.message,
          variant: data.success ? 'default' : 'destructive',
        });
        console.log(`📱 Telegram тест: ${data.success ? 'Успешно' : 'Ошибка'}`);
      }
    } catch (error: any) {
      console.error('❌ Ошибка тестирования Telegram:', error);
      toast({
        title: 'Ошибка подключения',
        description: 'Не удалось протестировать Telegram уведомления',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const scanArbitrageOpportunities = async () => {
    setIsScanning(true);
    try {
      console.log('🔍 Запускаю сканирование арбитражных возможностей...');
      
      const { data, error } = await supabase.functions.invoke('high_speed_arbitrage_scanner_2025_11_17_11_55', {
        body: {
        maxPriceDeviation: settings.maxPriceDeviation,
        priceConvergenceThreshold: settings.priceConvergenceThreshold,
        telegramEnabled: settings.telegramEnabled,
        minVolume: settings.minVolume || 1000000
      }
      });

      if (error) {
        console.error('❌ Ошибка сканирования:', error);
        toast({
          title: 'Ошибка сканирования',
          description: error.message || 'Не удалось выполнить сканирование',
          variant: 'destructive',
        });
      } else if (data && data.opportunities) {
        setOpportunities(data.opportunities);
        // Сохраняем в localStorage
        localStorage.setItem("arbitrage_opportunities", JSON.stringify(data.opportunities));
        console.log(`✅ Найдено ${data.opportunities.length} арбитражных возможностей`);
        
        toast({
          title: 'Сканирование завершено',
          description: `Найдено ${data.opportunities.length} возможностей (лимит отклонения ${settings.maxPriceDeviation}%)`,
        });

        // Автоматический вход в лучшие сделки если включена автоторговля
        if (settings.autoTradingEnabled && data.opportunities.length > 0) {
          const bestOpportunity = data.opportunities[0];
          if (bestOpportunity.spread >= settings.minSpread) {
            await enterTrade(bestOpportunity.id);
          }
        }
      } else {
        console.log('⚠️ Нет данных от сервера');
        toast({
          title: 'Нет данных',
          description: 'Сервер не вернул данные о возможностях',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('❌ Ошибка:', error);
      toast({
        title: 'Ошибка подключения',
        description: 'Не удалось подключиться к торговой системе',
        variant: 'destructive',
      });
    } finally {
      setIsScanning(false);
    }
  };

  const enterTrade = async (opportunityId: string) => {
    try {
      console.log(`🚀 Входим в сделку: ${opportunityId}`);
      
      const { data, error } = await supabase.functions.invoke('high_speed_arbitrage_scanner_2025_11_17_11_55', {
        body: { action: 'enter_trade', opportunityId, settings }
      });

      if (error) {
        console.error('❌ Ошибка входа в сделку:', error);
        toast({
          title: 'Ошибка входа в сделку',
          description: error.message || 'Не удалось войти в сделку',
          variant: 'destructive',
        });
      } else if (data && data.success) {
        toast({
          title: 'Сделка открыта!',
          description: 'Успешно вошли в арбитражную сделку',
        });
        
        // Обновляем список активных позиций
        monitorActivePositions();
      }
    } catch (error: any) {
      console.error('❌ Ошибка:', error);
      toast({
        title: 'Ошибка',
        description: 'Не удалось войти в сделку',
        variant: 'destructive',
      });
    }
  };

  const monitorActivePositions = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('high_speed_arbitrage_scanner_2025_11_17_11_55', {
        body: { action: 'monitor' }
      });

      if (data && data.activePositions) {
        setActivePositions(data.activePositions);
        setTotalPnL(data.totalUnrealizedPnL || 0);
      }
    } catch (error) {
      console.error('❌ Ошибка мониторинга:', error);
    }
  };

  const updateSettings = (newSettings: Partial<TradingSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Низкий': return 'bg-green-500';
      case 'Средний': return 'bg-yellow-500';
      case 'Высокий': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'closing': return 'bg-yellow-500';
      case 'completed': return 'bg-blue-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getConvergenceTrendColor = (trend: string) => {
    switch (trend) {
      case 'converging': return 'text-green-600';
      case 'diverging': return 'text-red-600';
      case 'stable': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const calculateTotalPosition = () => {
    return settings.tradeAmount * settings.leverage;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">💱 Межбиржевой Арбитраж</h2>
          <p className="text-muted-foreground">
            Боевая торговая система с пользовательскими настройками отклонения цен и Telegram уведомлениями
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Switch
              checked={settings.autoScanningEnabled}
              onCheckedChange={(checked) => updateSettings({ autoScanningEnabled: checked })}
            />
            <Label>Автосканирование</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              checked={settings.autoTradingEnabled}
              onCheckedChange={(checked) => updateSettings({ autoTradingEnabled: checked })}
            />
            <Label>Автоторговля</Label>
          </div>
          <Button
            onClick={scanArbitrageOpportunities}
            disabled={isScanning}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {isScanning ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Сканирование...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Сохранить в БД
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Возможности</p>
                <p className="text-2xl font-bold">{opportunities.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Play className="h-4 w-4 text-blue-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Активные позиции</p>
                <p className="text-2xl font-bold">{activePositions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <DollarSign className="h-4 w-4 text-green-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Нереализованная P&L</p>
                <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${totalPnL.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Zap className="h-4 w-4 text-purple-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Плечо</p>
                <p className="text-2xl font-bold">{settings.leverage}x</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Target className="h-4 w-4 text-orange-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Общая позиция</p>
                <p className="text-2xl font-bold">${calculateTotalPosition()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Shield className="h-4 w-4 text-red-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Лимит отклонения</p>
                <p className="text-2xl font-bold">{settings.maxPriceDeviation}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="opportunities" className="space-y-4">
        <TabsList>
          <TabsTrigger value="opportunities">Возможности</TabsTrigger>
          <TabsTrigger value="positions">Активные позиции</TabsTrigger>
          <TabsTrigger value="settings">Настройки</TabsTrigger>
        </TabsList>

        <TabsContent value="opportunities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Арбитражные возможности с настраиваемыми лимитами</CardTitle>
              <CardDescription>
                Реальные спреды между биржами с пользовательскими настройками отклонения цен (автосканирование каждые 30 сек при включении)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {opportunities.length === 0 ? (
                  <div className="text-center py-8">
                    <Target className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Нет реальных арбитражных возможностей
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Текущий лимит отклонения цен: {settings.maxPriceDeviation}%
                    </p>
                    <Button onClick={scanArbitrageOpportunities} disabled={isScanning}>
                      {isScanning ? 'Сканирование...' : 'Запустить сканирование'}
                    </Button>
                  </div>
                ) : (
                  opportunities.map((opportunity) => (
                    <div key={opportunity.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div>
                          <p className="font-semibold">{opportunity.symbol}</p>
                          <p className="text-sm text-muted-foreground">
                            {opportunity.buyExchange} → {opportunity.sellExchange}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Спред</p>
                          <p className="font-semibold text-green-600">{parseFloat(opportunity.spread || 0).toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Прибыль</p>
                          <p className="font-semibold">${parseFloat(opportunity.estimatedProfit || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Объем 24ч</p>
                          <p className="text-sm">${(parseFloat(opportunity.volume24h || 0) / 1000000).toFixed(1)}M</p>
                        </div>
                        {opportunity.priceConvergence && (
                          <div>
                            <p className="text-sm text-muted-foreground">Отклонение</p>
                            <p className={`text-sm font-semibold ${getConvergenceTrendColor(opportunity.priceConvergence.trend)}`}>
                              {parseFloat(opportunity.priceConvergence?.convergencePercentage || 0).toFixed(2)}%
                            </p>
                            <p className="text-xs text-muted-foreground">{opportunity.priceConvergence.trend}</p>
                          </div>
                        )}
                        <Badge className={`${getRiskColor(opportunity.risk)} text-white`}>
                          {opportunity.risk}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          onClick={() => enterTrade(opportunity.id)}
                          disabled={settings.autoTradingEnabled}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Войти в сделку
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Активные позиции</CardTitle>
              <CardDescription>
                Мониторинг открытых арбитражных сделок в реальном времени
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activePositions.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Нет активных позиций
                    </p>
                  </div>
                ) : (
                  activePositions.map((position) => (
                    <div key={position.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div>
                          <p className="font-semibold">{position.symbol}</p>
                          <p className="text-sm text-muted-foreground">
                            {position.buyExchange} ↔ {position.sellExchange}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Время входа</p>
                          <p className="text-sm">{new Date(position.entryTime).toLocaleTimeString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Текущий спред</p>
                          <p className="font-semibold">{position.currentSpread.toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">P&L</p>
                          <p className={`font-semibold ${position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${position.unrealizedPnL.toFixed(2)}
                          </p>
                        </div>
                        <Badge className={`${getStatusColor(position.status)} text-white`}>
                          {position.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Настройки межбиржевого арбитража
              </CardTitle>
              <CardDescription>
                Конфигурация параметров автоматической торговли и пользовательских лимитов отклонения цен
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Основные параметры</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="leverage">Плечо</Label>
                    <Select
                      value={settings.leverage.toString()}
                      onValueChange={(value) => updateSettings({ leverage: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите плечо" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1x</SelectItem>
                        <SelectItem value="2">2x</SelectItem>
                        <SelectItem value="3">3x</SelectItem>
                        <SelectItem value="4">4x</SelectItem>
                        <SelectItem value="5">5x</SelectItem>
                        <SelectItem value="6">6x</SelectItem>
                        <SelectItem value="7">7x</SelectItem>
                        <SelectItem value="8">8x</SelectItem>
                        <SelectItem value="9">9x</SelectItem>
                        <SelectItem value="10">10x</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Текущее плечо: {settings.leverage}x
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="tradeAmount">Сумма для входа в сделку (USD)</Label>
                    <Input
                      id="tradeAmount"
                      type="text"
                      value={settings.tradeAmount}
                      onChange={(e) => updateSettings({ tradeAmount: e.target.value })}
                    />
                    <p className="text-sm text-muted-foreground">
                      Общая позиция с плечом: ${calculateTotalPosition()}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Фильтры возможностей</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="minSpread">Минимальный спред (%)</Label>
                    <Input
                      id="minSpread"
                      type="text"
                      value={settings.minSpread}
                      onChange={(e) => updateSettings({ minSpread: e.target.value })}
                    />
                    <p className="text-sm text-muted-foreground">
                      Минимальный спред для входа: {settings.minSpread}%
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="minVolume">Минимальный объем торгов (USD)</Label>
                    <Input
                      id="minVolume"
                      type="text"
                      value={settings.minVolume}
                      onChange={(e) => updateSettings({ minVolume: e.target.value0000 })}
                    />
                    <p className="text-sm text-muted-foreground">
                      Минимальный объем: ${(settings.minVolume / 1000000).toFixed(0)}M
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxPriceDeviation" className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-red-600" />
                      Максимальное отклонение цен между биржами (%)
                    </Label>
                    <Input
                      id="maxPriceDeviation"
                      type="text"
                      value={settings.maxPriceDeviation}
                      onChange={(e) => updateSettings({ maxPriceDeviation: e.target.value })}
                    />
                    <p className="text-sm text-muted-foreground">
                      Максимальное отклонение: {settings.maxPriceDeviation}% (25% рекомендуется для больших спредов)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priceConvergenceThreshold">Порог схождения цен (%)</Label>
                    <Input
                      id="priceConvergenceThreshold"
                      type="text"
                      value={settings.priceConvergenceThreshold}
                      onChange={(e) => updateSettings({ priceConvergenceThreshold: e.target.value })}
                    />
                    <p className="text-sm text-muted-foreground">
                      Уведомления при схождении менее {settings.priceConvergenceThreshold}%
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Автоматизация и уведомления</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Автоматическое сканирование</Label>
                      <p className="text-sm text-muted-foreground">
                        Автоматический поиск возможностей каждые 30 секунд
                      </p>
                    </div>
                    <Switch
                      checked={settings.autoScanningEnabled}
                      onCheckedChange={(checked) => updateSettings({ autoScanningEnabled: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Автоматическая торговля</Label>
                      <p className="text-sm text-muted-foreground">
                        Автоматический вход в сделки при обнаружении возможностей
                      </p>
                    </div>
                    <Switch
                      checked={settings.autoTradingEnabled}
                      onCheckedChange={(checked) => updateSettings({ autoTradingEnabled: checked })}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Уведомления в Telegram</Label>
                      <p className="text-sm text-muted-foreground">
                        Отправка уведомлений о входе/выходе из сделок
                      </p>
                    </div>
                    <Switch
                      checked={settings.telegramEnabled}
                      onCheckedChange={(checked) => updateSettings({ telegramEnabled: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Уведомления о схождении цен</Label>
                      <p className="text-sm text-muted-foreground">
                        Уведомления при приближении цен к схождению для ручного мониторинга
                      </p>
                    </div>
                    <Switch
                      checked={settings.convergenceNotificationsEnabled}
                      onCheckedChange={(checked) => updateSettings({ convergenceNotificationsEnabled: checked })}
                    />
                  </div>

                  <div className="flex items-center space-x-4 pt-4">
                    <Button
                      onClick={testTelegramNotifications}
                      disabled={isTesting}
                      variant="outline"
                      className="flex-1"
                    >
                      {isTesting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                          Тестирование...
                        </>
                      ) : (
                        <>
                          <TestTube className="mr-2 h-4 w-4" />
                          Тест Telegram
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="bg-muted/50 p-4 rounded-lg flex-1 mr-4">
                  <h4 className="font-semibold mb-2">⚙️ НОВЫЕ НАСТРОЙКИ - ПОЛЬЗОВАТЕЛЬСКИЕ ЛИМИТЫ</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <strong>Максимальное отклонение цен</strong> - ВЫ сами настраиваете лимит</li>
                    <li>• <strong>Убрано жесткое ограничение 5%</strong> - теперь можно до 25% и выше</li>
                    <li>• <strong>Пример:</strong> Спреды по 25% теперь проходят фильтр</li>
                    <li>• <strong>Рекомендация:</strong> 25% для больших спредов, 5% для консервативной торговли</li>
                    <li>• <strong>Схождение цен</strong> - отслеживание приближения цен для ручного входа</li>
                    <li>• <strong>Telegram уведомления</strong> - автоматические сообщения о возможностях</li>
                    <li>• Автосканирование работает каждые 30 секунд при включении</li>
                    <li>• Мониторинг позиций обновляется каждые 10 секунд</li>
                    <li>• Рекомендуется начинать с небольших сумм для тестирования</li>
                  </ul>
                </div>
                
                <Button
                  onClick={saveSettingsToDatabase}
                  disabled={isSaving}
                  className="bg-green-600 hover:bg-green-700 min-w-[200px]"
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Сохранение...
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      Сохранить в БД
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedArbitrageTrading;
