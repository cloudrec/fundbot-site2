import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CleanSettings {
  exchange: string;
  base_asset: string;
  quote_asset: string;
  order_amount_usd: number;
  leverage: number;
  take_profit_percent: number;
  stop_loss_percent: number;
  funding_delay_ms: number;
  order_timeout_minutes: number;
  long_tp_offset_percent: number;
  long_stop_loss_percent: number;
  short_tp_offset_percent: number;
  short_stop_loss_percent: number;
  telegram_notifications: boolean;
  // Новые настройки логики входа
  entry_direction: 'short_first' | 'long_first';
  opposite_entry_delay_seconds: number;
}

interface TradingSettingsProps {
  user: any;
  onExchangeChange?: (exchange: string) => void;
  currentExchange?: string;
}

const TradingSettings: React.FC<TradingSettingsProps> = ({ user, onExchangeChange, currentExchange }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // 📊 ЧЕКБОКСЫ БИРЖ ДЛЯ ТОРГОВЛИ
  const [enabledExchanges, setEnabledExchanges] = useState({
    binance: true,
    bybit: true,
    gate: true,
    okx: true,
    kucoin: true,
    mexc: true
  });
  
  const [settings, setSettings] = useState<CleanSettings>({
    exchange: 'bybit',
    base_asset: 'BTC',
    quote_asset: 'USDT',
    order_amount_usd: 100,
    leverage: 10,
    take_profit_percent: 0.5,
    stop_loss_percent: 1.0,
    funding_delay_ms: 5000,
    order_timeout_minutes: 30,
    long_tp_offset_percent: 0.3,
    long_stop_loss_percent: 2.0,
    short_tp_offset_percent: 0.3,
    short_stop_loss_percent: 2.0,
    telegram_notifications: true,
    // Новые настройки логики входа
    entry_direction: 'short_first' as 'short_first' | 'long_first',
    opposite_entry_delay_seconds: 2
  });

  // Загрузка настроек
  useEffect(() => {
    if (user?.email) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      console.log('🔄 CLEAN: Loading settings for user:', user.email);
      
      const { data, error } = await supabase
        .from('trading_settings_dev')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Settings load error:', error);
        return;
      }

      if (data) {
        console.log('🔄 CLEAN: Settings loaded from DB:', data);
        console.log('🔍 CLEAN: SHORT TP from DB:', data.short_tp_offset_percent);
        console.log('🔍 CLEAN: SHORT SL from DB:', data.short_stop_loss_percent);
        
        const cleanSettings = {
          exchange: data.exchange || 'bybit',
          base_asset: data.base_asset || 'BTC',
          quote_asset: data.quote_asset || 'USDT',
          order_amount_usd: data.order_amount_usd || 100,
          leverage: data.leverage || 10,
          take_profit_percent: data.take_profit_percent || 0.5,
          stop_loss_percent: data.stop_loss_percent || 1.0,
          funding_delay_ms: data.funding_delay_ms || 5000,
          order_timeout_minutes: data.order_timeout_minutes || 30,
          long_tp_offset_percent: data.long_tp_offset_percent || 0.3,
          long_stop_loss_percent: data.long_stop_loss_percent || 2.0,
          short_tp_offset_percent: data.short_tp_offset_percent || 0.3,
          short_stop_loss_percent: data.short_stop_loss_percent || 2.0,
          telegram_notifications: data.telegram_notifications ?? true,
          // Новые настройки логики входа
          entry_direction: (data.entry_direction as 'short_first' | 'long_first') || 'short_first',
          opposite_entry_delay_seconds: data.opposite_entry_delay_seconds || 2
        };
        
        console.log('🔄 CLEAN: Setting clean settings:', cleanSettings);
        console.log('🔄 CLEAN: SHORT settings being set:', {
          short_tp: cleanSettings.short_tp_offset_percent,
          short_sl: cleanSettings.short_stop_loss_percent
        });
        
        setSettings(cleanSettings);
        
        // 📊 Загружаем чекбоксы бирж
        if (data.enabled_exchanges) {
          try {
            const exchanges = typeof data.enabled_exchanges === 'string' 
              ? JSON.parse(data.enabled_exchanges) 
              : data.enabled_exchanges;
            setEnabledExchanges(exchanges);
            console.log('📊 CLEAN: Loaded enabled exchanges:', exchanges);
            console.log('📊 CLEAN: Raw enabled_exchanges from DB:', data.enabled_exchanges);
          } catch (e) {
            console.log('📊 CLEAN: Error parsing enabled_exchanges, using defaults');
          }
        }
        
        // 📊 Принудительная проверка чекбоксов
        setTimeout(() => {
          console.log('📊 CLEAN: Current enabledExchanges state:', enabledExchanges);
        }, 1000);
        
        // Принудительно обновляем поля ввода
        setTimeout(() => {
          const shortTpInput = document.getElementById('shortTpOffset') as HTMLInputElement;
          if (shortTpInput) {
            shortTpInput.value = cleanSettings.short_tp_offset_percent.toString();
            console.log('🔄 CLEAN: Force updated SHORT TP input to:', cleanSettings.short_tp_offset_percent);
          }
          
          const shortSlInput = document.getElementById('shortStopLoss') as HTMLInputElement;
          if (shortSlInput) {
            shortSlInput.value = cleanSettings.short_stop_loss_percent.toString();
            console.log('🔄 CLEAN: Force updated SHORT SL input to:', cleanSettings.short_stop_loss_percent);
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  // Функция загрузки настроек по выбранной бирже
  const loadExchangeSettings = async (exchange: string) => {
    try {
      setLoading(true);
      console.log(`🔄 Загрузка настроек для биржи: ${exchange}`);
      
      // Сначала пробуем найти настройки для конкретной биржи
      let { data, error } = await supabase
        .from('trading_settings_dev')
        .select('*')
        .eq('user_id', user.id)
        .eq('exchange', exchange)
        .single();
      
      // Если не нашли, пробуем загрузить любые настройки пользователя
      if (error && error.code === 'PGRST116') {
        console.log(`🔍 Настройки для ${exchange} не найдены, загружаем общие настройки`);
        
        const result = await supabase
          .from('trading_settings_dev')
          .select('*')
          .eq('user_id', user.id)
          .limit(1)
          .single();
          
        data = result.data;
        error = result.error;
        
        if (data) {
          console.log(`✅ Найдены общие настройки, адаптируем для ${exchange}`);
          // Обновляем биржу в настройках
          data = { ...data, exchange: exchange };
        }
      }
      
      if (error && error.code !== 'PGRST116') {
        console.error('❌ Ошибка загрузки настроек биржи:', error);
        toast({
          title: "❌ Ошибка",
          description: `Не удалось загрузить настройки для ${exchange}`,
          variant: "destructive",
        });
        return;
      }
      
      if (data) {
        console.log(`✅ Настройки для ${exchange} загружены:`, data);
        
        // Обновляем все поля с данными из базы
        const loadedSettings = {
          exchange: data.exchange || exchange,
          base_asset: data.base_asset || 'BTC',
          quote_asset: data.quote_asset || 'USDT',
          order_amount_usd: data.order_amount_usd || 10,
          leverage: data.leverage || 10,
          long_tp_offset_percent: data.long_tp_offset_percent || 0.5,
          long_stop_loss_percent: data.long_stop_loss_percent || 1.0,
          short_tp_offset_percent: data.short_tp_offset_percent || 0.5,
          short_stop_loss_percent: data.short_stop_loss_percent || 1.0,
          entry_direction: data.entry_direction || 'both',
          opposite_entry_delay_seconds: data.opposite_entry_delay_seconds || 30,
          funding_delay_ms: data.funding_delay_ms || 450,
          order_timeout_minutes: data.order_timeout_minutes || 5
        };
        
        setSettings(loadedSettings);
        
        // Обновляем чекбоксы бирж если есть данные
        if (data.enabled_exchanges) {
          if (typeof data.enabled_exchanges === 'object') {
            setEnabledExchanges(data.enabled_exchanges);
          }
        }
        
        toast({
          title: "✅ Настройки загружены",
          description: `Настройки для ${exchange} успешно загружены. Плечо: ${data.leverage || 10}x, Сумма: $${data.order_amount_usd || 10}`,
        });
      } else {
        console.log(`⚠️ Настройки для ${exchange} не найдены, используются значения по умолчанию`);
        toast({
          title: "⚠️ Настройки не найдены",
          description: `Настройки для ${exchange} не найдены в базе данных. Сначала сохраните настройки для этой биржи.`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('❌ Ошибка загрузки настроек биржи:', error);
      toast({
        title: "❌ Ошибка",
        description: `Ошибка загрузки настроек: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setLoading(true);
      console.log('💾 CLEAN: Saving settings:', settings);
      console.log('📊 CLEAN: Saving enabled exchanges:', enabledExchanges);
      
      // Проверяем, есть ли уже настройки для КОНКРЕТНОЙ биржи
      console.log(`💾 Проверяем настройки для биржи: ${settings.exchange}`);
      const { data: existingSettings } = await supabase
        .from('trading_settings_dev')
        .select('id')
        .eq('user_id', user.id)
        .eq('exchange', settings.exchange) // Поиск по конкретной бирже
        .single();

      let data, error;
      
      if (existingSettings) {
        // Обновляем существующие настройки
        // Фильтруем только существующие поля
        const validSettings = {
          exchange: settings.exchange,
          base_asset: settings.base_asset,
          quote_asset: settings.quote_asset,
          order_amount_usd: settings.order_amount_usd,
          leverage: settings.leverage,
          long_tp_offset_percent: settings.long_tp_offset_percent,
          long_stop_loss_percent: settings.long_stop_loss_percent,
          short_tp_offset_percent: settings.short_tp_offset_percent,
          short_stop_loss_percent: settings.short_stop_loss_percent,
          // Новые настройки логики входа
          entry_direction: settings.entry_direction,
          opposite_entry_delay_seconds: settings.opposite_entry_delay_seconds,
          funding_delay_ms: settings.funding_delay_ms,
          order_timeout_minutes: settings.order_timeout_minutes,
          // 📊 Сохраняем чекбоксы бирж как JSONB
          enabled_exchanges: enabledExchanges
        };
        
        console.log(`🔄 Обновляем настройки для биржи: ${settings.exchange}`);
        const result = await supabase
          .from('trading_settings_dev')
          .update({
            ...validSettings,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('exchange', settings.exchange); // Обновляем только для конкретной биржи
        
        data = result.data;
        error = result.error;
      } else {
        // Создаем новые настройки
        // Фильтруем только существующие поля
        const validSettings = {
          exchange: settings.exchange,
          base_asset: settings.base_asset,
          quote_asset: settings.quote_asset,
          order_amount_usd: settings.order_amount_usd,
          leverage: settings.leverage,
          long_tp_offset_percent: settings.long_tp_offset_percent,
          long_stop_loss_percent: settings.long_stop_loss_percent,
          short_tp_offset_percent: settings.short_tp_offset_percent,
          short_stop_loss_percent: settings.short_stop_loss_percent,
          // Новые настройки логики входа
          entry_direction: settings.entry_direction,
          opposite_entry_delay_seconds: settings.opposite_entry_delay_seconds,
          funding_delay_ms: settings.funding_delay_ms,
          order_timeout_minutes: settings.order_timeout_minutes
        };
        
        const result = await supabase
          .from('trading_settings_dev')
          .insert({
            user_id: user.id,
            ...validSettings,
            // 📊 Добавляем чекбоксы бирж как JSONB
            enabled_exchanges: enabledExchanges,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        data = result.data;
        error = result.error;
      }

      if (error) {
        throw error;
      }

      console.log('💾 CLEAN: Save result:', { data, error });

      toast({
        title: "✅ Настройки сохранены!",
        description: `${settings.base_asset}/${settings.quote_asset} на ${settings.exchange}`,
      });
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: "❌ Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Функция для переключения бирж в торговой панели
  const toggleExchange = (exchange: string) => {
    setEnabledExchanges(prev => ({
      ...prev,
      [exchange]: !prev[exchange as keyof typeof prev]
    }));
  };

  return (
    <Card className="trading-card">
      <CardHeader>
        <CardTitle className="text-xl font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">⚙️ Настройки торговли</CardTitle>
        <CardDescription className="text-muted-foreground/80">Настройте параметры для автоматической торговли</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* БИРЖА И ВАЛЮТНАЯ ПАРА */}
        <div className="space-y-4 p-4 bg-blue-50 border-2 border-blue-400 rounded-lg">
          <h3 className="text-xl font-bold text-blue-800">🏦 БИРЖА И ВАЛЮТНАЯ ПАРА</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="exchange" className="font-semibold">🏦 Биржа</Label>
              <div className="flex gap-2">
                <Select
                  value={settings.exchange}
                  onValueChange={(value) => {
                    setSettings(prev => ({ ...prev, exchange: value }));
                    // Автоматически загружаем настройки при смене биржи
                    loadExchangeSettings(value);
                    // Передаем выбранную биржу в TradingDashboard
                    if (onExchangeChange) {
                      onExchangeChange(value);
                      console.log('📝 БИРЖА ИЗМЕНЕНА НА:', value);
                    }
                  }}
                >
                <SelectTrigger className="vision-input text-foreground">
                  <SelectValue placeholder="Выберите биржу" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bybit">Bybit</SelectItem>
                  <SelectItem value="binance">Binance</SelectItem>
                  <SelectItem value="gate">Gate.io</SelectItem>
                  <SelectItem value="kucoin">KuCoin</SelectItem>
                  <SelectItem value="okx">OKX</SelectItem>
                  <SelectItem value="mexc">MEXC</SelectItem>
                </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-600 mt-1">Криптовалютная биржа для торговли</p>
            </div>
            <div>
              <Label htmlFor="baseAsset" className="font-semibold">🪙 Базовая валюта</Label>
              <Input
                id="baseAsset"
                value={settings.base_asset}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  setSettings(prev => ({ ...prev, base_asset: value }));
                }}
                placeholder="BTC"
                className="vision-input text-foreground"
              />
              <p className="text-xs text-gray-600 mt-1">Криптовалюта для торговли (BTC, ETH, ADA)</p>
            </div>
            <div>
              <Label htmlFor="quoteAsset" className="font-semibold">💵 Котировочная валюта</Label>
              <Select
                value={settings.quote_asset}
                onValueChange={(value) => setSettings(prev => ({ ...prev, quote_asset: value }))}
              >
                <SelectTrigger className="vision-input text-foreground">
                  <SelectValue placeholder="USDT" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDT">USDT</SelectItem>
                  <SelectItem value="BUSD">BUSD</SelectItem>
                  <SelectItem value="BTC">BTC</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-600 mt-1">Валюта для расчетов (обычно USDT)</p>
            </div>
          </div>
        </div>
        
        {/* КНОПКИ СОХРАНЕНИЯ И ЗАГРУЗКИ ВВЕРХУ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
          <Button 
            onClick={saveSettings} 
            disabled={loading}
            className="btn-vision-primary px-8 py-2 text-lg font-semibold"
          >
            {loading ? 'Сохраняю...' : '💾 Сохранить настройки'}
          </Button>
          
          <Button 
            onClick={() => loadExchangeSettings(settings.exchange)} 
            disabled={loading}
            variant="outline"
            className="px-8 py-2 text-lg font-semibold border-2 border-primary text-primary hover:bg-primary hover:text-white"
          >
            {loading ? '🔄 Загрузка...' : '🔄 Загрузить настройки биржи'}
          </Button>
        </div>

        {/* РАЗМЕР ОРДЕРА И ПЛЕЧО */}
        <div className="space-y-4 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
          <h3 className="text-xl font-bold text-yellow-800">💰 РАЗМЕР ОРДЕРА И ПЛЕЧО</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="orderAmount" className="font-semibold">💵 Размер ордера (USD)</Label>
              <Input
                id="orderAmount"
                type="number"
                value={settings.order_amount_usd}
                onChange={(e) => setSettings(prev => ({ ...prev, order_amount_usd: Number(e.target.value) }))}
                className="vision-input text-foreground"
                placeholder="100"
              />
              <p className="text-xs text-gray-600 mt-1">Сумма в долларах на один ордер</p>
            </div>
            <div>
              <Label htmlFor="leverage" className="font-semibold">⚡ Плечо (leverage)</Label>
              <Input
                id="leverage"
                type="number"
                min="1"
                max="100"
                value={settings.leverage}
                onChange={(e) => setSettings(prev => ({ ...prev, leverage: Number(e.target.value) }))}
                className="vision-input text-foreground"
                placeholder="10"
              />
              <p className="text-xs text-gray-600 mt-1">Увеличивает размер позиции. Плечо 10x = позиция в 10 раз больше. ОСТОРОЖНО: высокие риски!</p>
            </div>
          </div>
        </div>

        {/* НАСТРОЙКИ ДЛЯ ЛОНГ ПОЗИЦИЙ */}
        <div className="space-y-4 p-4 bg-green-50 border-2 border-green-400 rounded-lg">
          <h3 className="text-xl font-bold text-green-800">📈 НАСТРОЙКИ ДЛЯ ЛОНГ ПОЗИЦИЙ</h3>
          <p className="text-sm text-green-700 font-medium">📈 Ордера на покупку (рост цены) - BUY/LONG</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="longTpOffset" className="text-green-800 font-bold">🎯 Смещение ТП для ЛОНГ (%)</Label>
              <Input
                id="longTpOffset"
                type="number"
                step="0.01"
                value={settings.long_tp_offset_percent}
                onChange={(e) => setSettings(prev => ({ ...prev, long_tp_offset_percent: Number(e.target.value) }))}
                className="vision-input text-foreground border-green-500/30 focus:border-green-500/60"
                placeholder="0.3"
              />
              <p className="text-xs text-green-600 mt-1">📈 ЛОНГ: Покупаем по цене X, продаем по цене X + 0.3% = прибыль</p>
            </div>
            <div>
              <Label htmlFor="longStopLoss" className="text-green-800 font-bold">🛑 Стоп-лосс для ЛОНГ (%)</Label>
              <Input
                id="longStopLoss"
                type="number"
                step="0.01"
                value={settings.long_stop_loss_percent}
                onChange={(e) => setSettings(prev => ({ ...prev, long_stop_loss_percent: Number(e.target.value) }))}
                className="vision-input text-foreground border-green-500/30 focus:border-green-500/60"
                placeholder="2.0"
              />
              <p className="text-xs text-green-600 mt-1">📈 ЛОНГ: Покупаем по цене X, если цена упадет до X - 2% = закрываем с убытком</p>
            </div>
          </div>
        </div>

        {/* НАСТРОЙКИ ДЛЯ ШОРТ ПОЗИЦИЙ */}
        <div className="space-y-4 p-4 bg-red-50 border-2 border-red-400 rounded-lg">
          <h3 className="text-xl font-bold text-red-800">📉 НАСТРОЙКИ ДЛЯ ШОРТ ПОЗИЦИЙ</h3>
          <p className="text-sm text-red-700 font-medium">📉 Ордера на продажу (падение цены) - SELL/SHORT</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="shortTpOffset" className="text-red-800 font-bold">🎯 Смещение ТП для ШОРТ (%)</Label>
              <Input
                id="shortTpOffset"
                type="number"
                step="0.01"
                value={settings.short_tp_offset_percent}
                onChange={(e) => setSettings(prev => ({ ...prev, short_tp_offset_percent: Number(e.target.value) }))}
                className="vision-input text-foreground border-red-500/30 focus:border-red-500/60"
                placeholder="0.3"
              />
              <p className="text-xs text-red-600 mt-1">📉 ШОРТ: Продаем по цене X, покупаем по цене X - 0.3% = прибыль</p>
            </div>
            <div>
              <Label htmlFor="shortStopLoss" className="text-red-800 font-bold">🛑 Стоп-лосс для ШОРТ (%)</Label>
              <Input
                id="shortStopLoss"
                type="number"
                step="0.01"
                value={settings.short_stop_loss_percent}
                onChange={(e) => setSettings(prev => ({ ...prev, short_stop_loss_percent: Number(e.target.value) }))}
                className="vision-input text-foreground border-red-500/30 focus:border-red-500/60"
                placeholder="2.0"
              />
              <p className="text-xs text-red-600 mt-1">📉 ШОРТ: Продаем по цене X, если цена вырастет до X + 2% = закрываем с убытком</p>
            </div>
          </div>
        </div>

        {/* ДОПОЛНИТЕЛЬНЫЕ НАСТРОЙКИ */}
        <div className="space-y-4 p-4 bg-purple-50 border-2 border-purple-400 rounded-lg">
          <h3 className="text-xl font-bold text-purple-800">🔧 ДОПОЛНИТЕЛЬНЫЕ НАСТРОЙКИ</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fundingDelay" className="text-purple-800 font-semibold">⏱️ Задержка после фандинга (мс)</Label>
              <Input
                id="fundingDelay"
                type="number"
                value={settings.funding_delay_ms}
                onChange={(e) => setSettings(prev => ({ ...prev, funding_delay_ms: Number(e.target.value) }))}
                className="vision-input text-foreground border-purple-500/30"
                placeholder="5000"
              />
              <p className="text-xs text-purple-600 mt-1">Пауза после выплаты фандинга перед размещением ордера</p>
            </div>
            <div>
              <Label htmlFor="orderTimeout" className="text-purple-800 font-semibold">⏰ Таймаут ордера (минуты)</Label>
              <Input
                id="orderTimeout"
                type="number"
                value={settings.order_timeout_minutes}
                onChange={(e) => setSettings(prev => ({ ...prev, order_timeout_minutes: Number(e.target.value) }))}
                className="vision-input text-foreground border-purple-500/30"
                placeholder="30"
              />
              <p className="text-xs text-purple-600 mt-1">Время жизни ордера до автоматической отмены</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="telegramNotifications"
              checked={settings.telegram_notifications}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, telegram_notifications: checked }))}
            />
            <Label htmlFor="telegramNotifications" className="text-purple-800 font-semibold">📱 Telegram уведомления</Label>
          </div>
          
          {/* Новые настройки логики входа */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-purple-800 font-semibold">🎯 Логика входа в позицию</Label>
              <Select
                value={settings.entry_direction}
                onValueChange={(value: 'short_first' | 'long_first') => 
                  setSettings(prev => ({ ...prev, entry_direction: value }))
                }
              >
                <SelectTrigger className="vision-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short_first">📉 Сначала ШОРТ, потом ЛОНГ</SelectItem>
                  <SelectItem value="long_first">📈 Сначала ЛОНГ, потом ШОРТ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-purple-800 font-semibold">⏱️ Задержка перед противоположной сделкой (секунды)</Label>
              <Input
                type="number"
                min="1"
                max="300"
                value={settings.opposite_entry_delay_seconds}
                onChange={(e) => setSettings(prev => ({ 
                  ...prev, 
                  opposite_entry_delay_seconds: parseInt(e.target.value) || 2 
                }))}
                className="vision-input"
                placeholder="2"
              />
              <p className="text-sm text-purple-600">
                Время ожидания после тейк-профита перед входом в обратную позицию
              </p>
            </div>
          </div>
        </div>

        {/* 📊 ЧЕКБОКСЫ БИРЖ ДЛЯ ТОРГОВЛИ */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">📊 Активные биржи для торговли</h3>
          <div className="flex flex-wrap gap-2">
            {['binance', 'bybit', 'gate', 'kucoin', 'okx', 'mexc'].map((exchange) => (
              <Badge
                key={exchange}
                variant={enabledExchanges[exchange as keyof typeof enabledExchanges] ? "default" : "outline"}
                className="cursor-pointer px-3 py-1 hover:scale-105 transition-transform"
                onClick={() => toggleExchange(exchange)}
              >
                {exchange.toUpperCase()}
                {enabledExchanges[exchange as keyof typeof enabledExchanges] && ' ✓'}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            📊 Выберите биржи для ручной торговли (независимо от ботов)
          </p>
        </div>

        {/* КНОПКИ СОХРАНЕНИЯ И ЗАГРУЗКИ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button 
            onClick={saveSettings} 
            disabled={loading}
            className="btn-vision-primary h-12 text-lg font-bold glow-primary"
          >
            {loading ? "💾 Сохранение..." : "💾 Сохранить настройки"}
          </Button>
          
          <Button 
            onClick={() => loadExchangeSettings(settings.exchange)} 
            disabled={loading}
            variant="outline"
            className="h-12 text-lg font-bold border-2 border-primary text-primary hover:bg-primary hover:text-white"
          >
            {loading ? "🔄 Загрузка..." : "🔄 Загрузить настройки биржи"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TradingSettings;