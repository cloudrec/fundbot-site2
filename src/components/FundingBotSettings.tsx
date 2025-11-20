import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Bot, TrendingUp, TrendingDown, Clock, Shield, Bell, Calendar, TestTube, X, BarChart3, Square } from 'lucide-react';
import FundingBotTrading from './FundingBotTrading';

interface FundingBotSettings {
  id?: string;
  enabled: boolean;
  // entry_strategy удален - бот сам выбирает направление
  min_funding_rate: number;
  position_size_usd: number;
  leverage: number; // Плечо для торговли
  scan_interval_minutes: number;
  exchanges: string[];
  max_positions: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  telegram_notifications: boolean;
  telegram_chat_id?: string;
  work_schedule_enabled: boolean;
  work_start_hour: number;
  work_end_hour: number;
  // Новые поля для планировщика
  last_scan_time?: string;
  auto_scan_enabled: boolean;
}

const defaultSettings: FundingBotSettings = {
  enabled: false,
  // entry_strategy: 'short_first', // удален
  min_funding_rate: 0.5,
  position_size_usd: 100,
  leverage: 10, // Плечо по умолчанию
  scan_interval_minutes: 30,
  exchanges: ['binance', 'bybit', 'gate', 'kucoin', 'okx', 'mexc'],
  max_positions: 3,
  stop_loss_percent: 5.0,
  take_profit_percent: 2.0,
  telegram_notifications: true,
  work_schedule_enabled: false,
  work_start_hour: 0,
  work_end_hour: 23,
  auto_scan_enabled: true,
};

export default function FundingBotSettings() {
  const [settings, setSettings] = useState<FundingBotSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedTestExchange, setSelectedTestExchange] = useState('bybit'); // Биржа для тестирования
  const [user, setUser] = useState<any>(null); // Добавляем состояние пользователя
  const { toast } = useToast();
  
  console.log('🤖 FUNDING BOT SETTINGS: Component loaded, user:', user?.email);

  useEffect(() => {
    loadSettings();
  }, []);
  
  // Отслеживаем изменения аутентификации
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🤖 FUNDING BOT: Auth state changed:', event, session?.user?.email);
        if (session?.user) {
          setUser(session.user);
          if (!settings.id) { // Загружаем настройки только если их еще нет
            loadSettings();
          }
        } else {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [settings.id]);

  const loadSettings = async () => {
    try {
      console.log('🔄 FUNDING BOT: Loading settings...');
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        console.error('🤖 FUNDING BOT: No user found');
        setLoading(false);
        return;
      }
      
      console.log('🤖 FUNDING BOT: User found:', currentUser.email);
      setUser(currentUser); // Сохраняем пользователя в состоянии

      const { data, error } = await supabase
        .from('funding_bot_settings_2025_11_09_06_55')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading funding bot settings:', error);
        return;
      }

      if (data) {
        setSettings({
          ...data,
          exchanges: data.exchanges || ['binance', 'bybit', 'gate', 'kucoin', 'okx', 'mexc'],
          auto_scan_enabled: data.auto_scan_enabled ?? true,
          scan_interval_minutes: data.scan_interval_minutes || 30,
          work_schedule_enabled: data.work_schedule_enabled ?? false,
          work_start_hour: data.work_start_hour ?? 0,
          work_end_hour: data.work_end_hour ?? 23,
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const settingsToSave = {
        ...settings,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('funding_bot_settings_2025_11_09_06_55')
        .upsert(settingsToSave);

      if (error) throw error;

      toast({
        title: "✅ Настройки сохранены",
        description: "Настройки фандинг бота успешно обновлены",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "❌ Ошибка сохранения",
        description: "Не удалось сохранить настройки",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const scanFunding = async () => {
    setScanning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('funding_bot_manager_2025_11_09_06_55', {
        body: {
          action: 'scan_funding',
          user_id: user.id
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "✅ Сканирование завершено",
          description: `Найдено ${data.data.total_opportunities} возможностей фандинга`,
        });
      } else {
        throw new Error(data?.error || 'Ошибка сканирования');
      }
    } catch (error) {
      console.error('Error scanning funding:', error);
      toast({
        title: "❌ Ошибка сканирования",
        description: "Не удалось просканировать фандинги",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const startAutoScheduler = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('auto_funding_scheduler_2025_11_09_08_00');

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "✅ Автоматический планировщик запущен",
          description: `Обработано ${data.scanned_users} пользователей`,
        });
      } else {
        throw new Error(data?.error || 'Ошибка запуска планировщика');
      }
    } catch (error) {
      console.error('Error starting auto scheduler:', error);
      toast({
        title: "❌ Ошибка запуска",
        description: "Не удалось запустить автоматический планировщик",
        variant: "destructive",
      });
    }
  };

  const startHourlyCron = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('hourly_funding_cron_2025_11_09_08_15');

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "✅ Почасовое сканирование запущено",
          description: `Обработано ${data.processed_users} пользователей. Сканирование каждый час.`,
        });
      } else {
        throw new Error(data?.error || 'Ошибка запуска почасового сканирования');
      }
    } catch (error) {
      console.error('Error starting hourly cron:', error);
      toast({
        title: "❌ Ошибка запуска",
        description: "Не удалось запустить почасовое сканирование",
        variant: "destructive",
      });
    }
  };

  const toggleExchange = (exchange: string) => {
    const newExchanges = settings.exchanges.includes(exchange)
      ? settings.exchanges.filter(e => e !== exchange)
      : [...settings.exchanges, exchange];
      
    const newSettings = {
      ...settings,
      exchanges: newExchanges
    };
    
    setSettings(newSettings);
    
    // 💾 Автоматически сохраняем настройки Funding Bot
    saveFundingExchanges(newSettings);
  };
  
  // Функция сохранения настроек бирж Funding Bot
  const saveFundingExchanges = async (newSettings: FundingBotSettings) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const settingsToSave = {
        ...newSettings,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('funding_bot_settings_2025_11_09_06_55')
        .upsert(settingsToSave);

      if (error) {
        console.error('📊 FUNDING BOT: Error saving exchanges:', error);
      } else {
        console.log('📊 FUNDING BOT: Exchanges saved:', newSettings.exchanges);
      }
    } catch (error) {
      console.error('📊 FUNDING BOT: Error in saveFundingExchanges:', error);
    }
  };
  
  // Функции тестирования Funding Bot
  const testFundingLong = async () => {
    setScanning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Используем ту же логику что и в TradingDashboard
      const result = await callTradingAPI('place_order_with_tp_sl', 'LONG', selectedTestExchange, user);

      if (result.success) {
        toast({
          title: "✅ Тест LONG выполнен",
          description: `Тестовый LONG ордер размещен на ${selectedTestExchange.toUpperCase()}`,
        });
      } else {
        throw new Error(result.error || 'Ошибка теста LONG');
      }
    } catch (error) {
      console.error('Error testing funding LONG:', error);
      toast({
        title: "❌ Ошибка теста LONG",
        description: "Не удалось выполнить тестовый LONG ордер",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };
  
  const testFundingShort = async () => {
    setScanning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Используем ту же логику что и в TradingDashboard
      const result = await callTradingAPI('place_order_with_tp_sl', 'SHORT', selectedTestExchange, user);

      if (result.success) {
        toast({
          title: "✅ Тест SHORT выполнен",
          description: `Тестовый SHORT ордер размещен на ${selectedTestExchange.toUpperCase()}`,
        });
      } else {
        throw new Error(result.error || 'Ошибка теста SHORT');
      }
    } catch (error) {
      console.error('Error testing funding SHORT:', error);
      toast({
        title: "❌ Ошибка теста SHORT",
        description: "Не удалось выполнить тестовый SHORT ордер",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  // Функция вызова торгового API (скопировано с TradingDashboard)
  const callTradingAPI = async (action: string, orderType: string = 'LONG', selectedExchange?: string, userParam?: any) => {
    try {
      // Используем переданного пользователя или глобального
      const currentUser = userParam || user;
      if (!currentUser?.id) {
        throw new Error('Пользователь не авторизован');
      }
      
      console.log('FUNDING BOT: Calling trading API:', { action, user_id: currentUser.id, selectedExchange });
      
      // Используем выбранную биржу или по умолчанию bybit
      const currentExchange = selectedExchange || 'bybit';
      console.log('✅ FUNDING BOT: Используем биржу:', currentExchange);
      
      // Определяем функцию по бирже (та же логика что в TradingDashboard)
      let functionName;
      if (currentExchange === 'binance') {
        functionName = 'binance_long_short_fixed_v34_2025_11_09_20_30';
      } else if (currentExchange === 'gate') {
        functionName = 'gate_wider_margins_v24_2025_11_09_18_25';
      } else if (currentExchange === 'kucoin') {
        functionName = 'kucoin_leverage_fixed_v27_2025_11_09_19_20';
      } else if (currentExchange === 'okx') {
        functionName = 'okx_symbol_fixed_v27_2025_11_09_19_25';
      } else if (currentExchange === 'mexc') {
        functionName = 'mexc_signature_fixed_v32_2025_11_09_20_05';
      } else {
        functionName = 'bybit_positions_settlecoin_v58_2025_11_10_06_40';
      }
      
      console.log('🎯 FUNDING BOT: Using function:', functionName, 'for exchange:', currentExchange);
      
      // Прямой вызов функции
      const response = await supabase.functions.invoke(functionName, {
        body: {
          action,
          user_id: currentUser.id,
          order_type: orderType
        }
      });
      
      console.log('FUNDING BOT: API Response:', response);
      
      if (response.error) {
        throw new Error(response.error.message || 'Ошибка API');
      }
      
      return response.data || { success: true };
      
    } catch (error: any) {
      console.error('FUNDING BOT: API Error:', error);
      throw error;
    }
  };

  // Функции управления позициями
  const cancelAllOrders = async () => {
    if (!user?.id) {
      toast({
        title: "❌ Ошибка",
        description: "Необходимо войти в систему",
        variant: "destructive",
      });
      return;
    }

    setScanning(true);
    try {
      // Получаем пользователя
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      
      // Используем ту же логику что и в TradingDashboard
      const result = await callTradingAPI('cancel_orders', 'LONG', selectedTestExchange, currentUser);

      toast({
        title: "❌ Ордера отменены",
        description: `Все активные ордера на ${selectedTestExchange.toUpperCase()} отменены`,
      });
    } catch (error: any) {
      console.error('Error canceling orders:', error);
      toast({
        title: "❌ Ошибка отмены ордеров",
        description: error.message || "Не удалось отменить ордера",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const showActivePositions = async () => {
    if (!user?.id) {
      toast({
        title: "❌ Ошибка",
        description: "Необходимо войти в систему",
        variant: "destructive",
      });
      return;
    }

    setScanning(true);
    try {
      // Получаем пользователя
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      
      // Используем ту же логику что и в TradingDashboard
      const result = await callTradingAPI('get_positions', 'LONG', selectedTestExchange, currentUser);

      const positionsCount = result?.positions?.length || 0;
      toast({
        title: "📈 Позиции загружены",
        description: `Найдено ${positionsCount} активных позиций на ${selectedTestExchange.toUpperCase()}`,
      });

      // Можно добавить модальное окно для отображения позиций
      console.log('📈 Позиции:', data?.positions);
    } catch (error: any) {
      console.error('Error getting positions:', error);
      toast({
        title: "❌ Ошибка загрузки позиций",
        description: error.message || "Не удалось загрузить позиции",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const closeAllPositions = async () => {
    if (!user?.id) {
      toast({
        title: "❌ Ошибка",
        description: "Необходимо войти в систему",
        variant: "destructive",
      });
      return;
    }

    setScanning(true);
    try {
      // Получаем пользователя
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      
      // Используем ту же логику что и в TradingDashboard
      const result = await callTradingAPI('close_positions', 'LONG', selectedTestExchange, currentUser);

      const closedCount = result?.closed_positions || result?.data?.closed_positions || 0;
      toast({
        title: "🔴 Позиции закрыты",
        description: `Закрыто ${closedCount} позиций на ${selectedTestExchange.toUpperCase()}`,
      });
    } catch (error: any) {
      console.error('Error closing positions:', error);
      toast({
        title: "❌ Ошибка закрытия позиций",
        description: error.message || "Не удалось закрыть позиции",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Проверяем наличие пользователя
  if (!user) {
    console.log('🤖 FUNDING BOT: No user, showing auth message');
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Bot className="h-16 w-16 text-muted-foreground mx-auto" />
          <div>
            <h2 className="text-xl font-semibold text-muted-foreground">Необходима авторизация</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Пожалуйста, войдите в систему для доступа к фандинг боту
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Заголовок */}
      <div className="flex items-center gap-3">
        <Bot className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Фандинг бот</h1>
          <p className="text-muted-foreground">
            Умная торговля по ставкам фандинга - бот сам выбирает LONG или SHORT
          </p>
        </div>
      </div>

      {/* Полноценный торговый функционал */}
      <div className="space-y-4">
        {/* Выбор биржи для тестирования */}
        <Card className="trading-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Выбор биржи для тестирования
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Label className="text-base font-medium">🎯 Биржа для тестирования</Label>
              <Select 
                value={selectedTestExchange} 
                onValueChange={setSelectedTestExchange}
              >
                <SelectTrigger className="vision-input">
                  <SelectValue placeholder="Выберите биржу" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bybit">🟠 Bybit</SelectItem>
                  <SelectItem value="binance">🟡 Binance</SelectItem>
                  <SelectItem value="gate">🟢 Gate.io</SelectItem>
                  <SelectItem value="kucoin">🔵 KuCoin</SelectItem>
                  <SelectItem value="okx">⚫ OKX</SelectItem>
                  <SelectItem value="mexc">🔴 MEXC</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Выберите биржу для тестирования. Убедитесь, что API ключи для этой биржи добавлены.
              </p>
            </div>
          </CardContent>
        </Card>
        
        {/* Полноценный торговый компонент */}
        <FundingBotTrading user={user} selectedExchange={selectedTestExchange} />
      </div>

      {/* Основные настройки */}
      <Card className="trading-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Основные настройки
          </CardTitle>
          <CardDescription>
            Включение и базовая конфигурация фандинг бота
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Включение бота */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Включить фандинг бот</Label>
              <p className="text-sm text-muted-foreground">
                Автоматическое размещение ордеров на основе фандинга
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, enabled }))}
            />
          </div>

          <Separator />

          {/* Кнопки тестирования */}

          {/* Минимальный фандинг */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Минимальный фандинг (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              value={settings.min_funding_rate}
              onChange={(e) => setSettings(prev => ({ 
                ...prev, 
                min_funding_rate: parseFloat(e.target.value) || 0.5 
              }))}
              className="vision-input"
            />
            <p className="text-sm text-muted-foreground">
              Минимальная ставка фандинга для входа в позицию
            </p>
          </div>

          {/* Размер позиции */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Размер позиции (USD)</Label>
            <Input
              type="number"
              min="10"
              max="10000"
              value={settings.position_size_usd}
              onChange={(e) => setSettings(prev => ({ 
                ...prev, 
                position_size_usd: parseInt(e.target.value) || 100 
              }))}
              className="vision-input"
            />
            <p className="text-sm text-muted-foreground">
              Размер каждой позиции в USD
            </p>
          </div>
          
          {/* Плечо */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Плечо (x)</Label>
            <Select 
              value={settings.leverage.toString()} 
              onValueChange={(value) => setSettings(prev => ({ 
                ...prev, 
                leverage: parseInt(value) || 10 
              }))}
            >
              <SelectTrigger className="vision-input">
                <SelectValue placeholder="Выберите плечо" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1x (без плеча)</SelectItem>
                <SelectItem value="2">2x</SelectItem>
                <SelectItem value="3">3x</SelectItem>
                <SelectItem value="5">5x</SelectItem>
                <SelectItem value="10">10x</SelectItem>
                <SelectItem value="20">20x</SelectItem>
                <SelectItem value="50">50x</SelectItem>
                <SelectItem value="100">100x</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Плечо для всех позиций Funding Bot
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Настройки сканирования */}
      <Card className="trading-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Настройки сканирования
          </CardTitle>
          <CardDescription>
            Частота проверки и выбор бирж для мониторинга
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Интервал сканирования */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Интервал сканирования (минуты)</Label>
            <Select
              value={settings.scan_interval_minutes.toString()}
              onValueChange={(value) => setSettings(prev => ({ 
                ...prev, 
                scan_interval_minutes: parseInt(value) 
              }))}
            >
              <SelectTrigger className="vision-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 минут</SelectItem>
                <SelectItem value="30">30 минут</SelectItem>
                <SelectItem value="60">1 час</SelectItem>
                <SelectItem value="120">2 часа</SelectItem>
                <SelectItem value="240">4 часа</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Автоматическое сканирование */}
          <div className="space-y-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
            <div className="flex items-center space-x-3">
              <Switch
                id="autoScanEnabled"
                checked={settings.auto_scan_enabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, auto_scan_enabled: checked }))}
              />
              <Label htmlFor="autoScanEnabled" className="text-base font-semibold text-blue-800">
                🤖 Автоматическое сканирование в фоне
              </Label>
            </div>
            
            {settings.auto_scan_enabled && (
              <div className="space-y-3 pl-8">
                <p className="text-sm text-blue-600">
                  📱 Фандинги будут автоматически отправляться в Telegram каждые {settings.scan_interval_minutes} минут с временем начисления по UTC+3
                </p>
                
                {/* Расписание работы */}
                <div className="flex items-center space-x-3">
                  <Switch
                    id="workScheduleEnabled"
                    checked={settings.work_schedule_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, work_schedule_enabled: checked }))}
                  />
                  <Label htmlFor="workScheduleEnabled" className="text-sm font-medium text-blue-700">
                    🕰️ Ограничить расписание работы
                  </Label>
                </div>
                
                {settings.work_schedule_enabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-blue-700">Начало работы (час UTC+3)</Label>
                      <Select
                        value={settings.work_start_hour.toString()}
                        onValueChange={(value) => setSettings(prev => ({ ...prev, work_start_hour: parseInt(value) }))}
                      >
                        <SelectTrigger className="vision-input">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString()}>{i.toString().padStart(2, '0')}:00</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-blue-700">Окончание работы (час UTC+3)</Label>
                      <Select
                        value={settings.work_end_hour.toString()}
                        onValueChange={(value) => setSettings(prev => ({ ...prev, work_end_hour: parseInt(value) }))}
                      >
                        <SelectTrigger className="vision-input">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString()}>{i.toString().padStart(2, '0')}:00</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Выбор бирж */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Биржи для сканирования</Label>
            <div className="flex flex-wrap gap-2">
              {['binance', 'bybit', 'gate', 'kucoin', 'okx', 'mexc'].map((exchange) => (
                <Badge
                  key={exchange}
                  variant={settings.exchanges.includes(exchange) ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1"
                  onClick={() => toggleExchange(exchange)}
                >
                  {exchange.toUpperCase()}
                  {settings.exchanges.includes(exchange) && ' ✓'}
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Выберите биржи для мониторинга ставок фандинга
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Управление рисками */}
      <Card className="trading-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Управление рисками
          </CardTitle>
          <CardDescription>
            Настройки безопасности и ограничения
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Максимум позиций */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Максимум открытых позиций</Label>
            <Input
              type="number"
              min="1"
              max="10"
              value={settings.max_positions}
              onChange={(e) => setSettings(prev => ({ 
                ...prev, 
                max_positions: parseInt(e.target.value) || 3 
              }))}
              className="vision-input"
            />
          </div>

          {/* Стоп-лосс */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Стоп-лосс (%)</Label>
            <Input
              type="number"
              step="0.5"
              min="1"
              max="20"
              value={settings.stop_loss_percent}
              onChange={(e) => setSettings(prev => ({ 
                ...prev, 
                stop_loss_percent: parseFloat(e.target.value) || 5.0 
              }))}
              className="vision-input"
            />
          </div>

          {/* Тейк-профит */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Тейк-профит (%)</Label>
            <Input
              type="number"
              step="0.5"
              min="0.5"
              max="10"
              value={settings.take_profit_percent}
              onChange={(e) => setSettings(prev => ({ 
                ...prev, 
                take_profit_percent: parseFloat(e.target.value) || 2.0 
              }))}
              className="vision-input"
            />
          </div>
        </CardContent>
      </Card>

      {/* Уведомления */}
      <Card className="trading-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Уведомления
          </CardTitle>
          <CardDescription>
            Настройки Telegram уведомлений
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Telegram уведомления */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Telegram уведомления</Label>
              <p className="text-sm text-muted-foreground">
                Получать уведомления о действиях бота
              </p>
            </div>
            <Switch
              checked={settings.telegram_notifications}
              onCheckedChange={(telegram_notifications) => 
                setSettings(prev => ({ ...prev, telegram_notifications }))
              }
            />
          </div>

          {settings.telegram_notifications && (
            <div className="space-y-3">
              <Label className="text-base font-medium">Telegram Chat ID</Label>
              <Input
                type="text"
                placeholder="@username или chat_id"
                value={settings.telegram_chat_id || ''}
                onChange={(e) => setSettings(prev => ({ 
                  ...prev, 
                  telegram_chat_id: e.target.value 
                }))}
                className="vision-input"
              />
              <p className="text-sm text-muted-foreground">
                Ваш Telegram username или chat ID для уведомлений
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Расписание работы */}
      <Card className="trading-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Расписание работы
          </CardTitle>
          <CardDescription>
            Ограничение времени работы бота
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Включение расписания */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">Ограничить время работы</Label>
              <p className="text-sm text-muted-foreground">
                Бот будет работать только в указанные часы
              </p>
            </div>
            <Switch
              checked={settings.work_schedule_enabled}
              onCheckedChange={(work_schedule_enabled) => 
                setSettings(prev => ({ ...prev, work_schedule_enabled }))
              }
            />
          </div>

          {settings.work_schedule_enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <Label className="text-base font-medium">Начало работы (час)</Label>
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={settings.work_start_hour}
                  onChange={(e) => setSettings(prev => ({ 
                    ...prev, 
                    work_start_hour: parseInt(e.target.value) || 0 
                  }))}
                  className="vision-input"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-base font-medium">Конец работы (час)</Label>
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={settings.work_end_hour}
                  onChange={(e) => setSettings(prev => ({ 
                    ...prev, 
                    work_end_hour: parseInt(e.target.value) || 23 
                  }))}
                  className="vision-input"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Кнопки управления */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Button 
          onClick={saveSettings} 
          disabled={saving}
          className="btn-vision-primary"
        >
          {saving ? 'Сохранение...' : '💾 Сохранить настройки'}
        </Button>
        
        <Button 
          onClick={scanFunding}
          disabled={scanning}
          className="btn-vision-secondary"
        >
          {scanning ? 'Сканирование...' : '🔍 Сканировать фандинги'}
        </Button>
        
        <Button 
          onClick={startHourlyCron}
          disabled={!settings.auto_scan_enabled}
          className="btn-vision-accent"
        >
          ⏰ Запустить скан каждый час
        </Button>
        
        <Button 
          variant="outline" 
          onClick={loadSettings}
          className="btn-vision-secondary"
        >
          🔄 Сбросить
        </Button>
      </div>
      

      {/* Статус бота */}
      <Card className="trading-card">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${settings.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="font-medium">
                Статус: {settings.enabled ? '🟢 Активен' : '🔴 Отключен'}
              </span>
            </div>
            <Badge variant={settings.enabled ? "default" : "secondary"}>
              {settings.enabled ? 'РАБОТАЕТ' : 'ОСТАНОВЛЕН'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}