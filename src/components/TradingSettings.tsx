import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  auto_trading_enabled: boolean;
}

interface TradingSettingsProps {
  user: any;
}

const TradingSettings: React.FC<TradingSettingsProps> = ({ user }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
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
    auto_trading_enabled: false
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
        .from('trading_settings')
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
          auto_trading_enabled: data.auto_trading_enabled ?? false
        };
        
        console.log('🔄 CLEAN: Setting clean settings:', cleanSettings);
        console.log('🔄 CLEAN: SHORT settings being set:', {
          short_tp: cleanSettings.short_tp_offset_percent,
          short_sl: cleanSettings.short_stop_loss_percent
        });
        
        setSettings(cleanSettings);
        
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

  const saveSettings = async () => {
    try {
      setLoading(true);
      console.log('💾 CLEAN: Saving settings:', settings);
      
      // Сначала проверяем, есть ли уже настройки
      const { data: existingSettings } = await supabase
        .from('trading_settings')
        .select('id')
        .eq('user_id', user.id)
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
          auto_trading_enabled: settings.auto_trading_enabled || false,
          funding_delay_ms: settings.funding_delay_ms,
          order_timeout_minutes: settings.order_timeout_minutes
        };
        
        const result = await supabase
          .from('trading_settings')
          .update({
            ...validSettings,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
        
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
          auto_trading_enabled: settings.auto_trading_enabled || false,
          funding_delay_ms: settings.funding_delay_ms,
          order_timeout_minutes: settings.order_timeout_minutes
        };
        
        const result = await supabase
          .from('trading_settings')
          .insert({
            user_id: user.id,
            ...validSettings,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>⚙️ Настройки торговли</CardTitle>
        <CardDescription>Настройте параметры для автоматической торговли</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* БИРЖА И ВАЛЮТНАЯ ПАРА */}
        <div className="space-y-4 p-4 bg-blue-50 border-2 border-blue-400 rounded-lg">
          <h3 className="text-xl font-bold text-blue-800">🏦 БИРЖА И ВАЛЮТНАЯ ПАРА</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="exchange" className="font-semibold">🏦 Биржа</Label>
              <Select
                value={settings.exchange}
                onValueChange={(value) => setSettings(prev => ({ ...prev, exchange: value }))}
              >
                <SelectTrigger className="text-black bg-white border-gray-300">
                  <SelectValue placeholder="Выберите биржу" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bybit">Bybit</SelectItem>
                  <SelectItem value="binance">Binance</SelectItem>
                  <SelectItem value="gate">Gate</SelectItem>
                </SelectContent>
              </Select>
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
                className="text-black bg-white border-gray-300"
              />
              <p className="text-xs text-gray-600 mt-1">Криптовалюта для торговли (BTC, ETH, ADA)</p>
            </div>
            <div>
              <Label htmlFor="quoteAsset" className="font-semibold">💵 Котировочная валюта</Label>
              <Select
                value={settings.quote_asset}
                onValueChange={(value) => setSettings(prev => ({ ...prev, quote_asset: value }))}
              >
                <SelectTrigger className="text-black bg-white border-gray-300">
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
                className="text-black bg-white border-gray-300"
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
                className="text-black bg-white border-gray-300"
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
                className="text-black bg-white border-green-300 focus:border-green-500"
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
                className="text-black bg-white border-green-300 focus:border-green-500"
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
                className="text-black bg-white border-red-300 focus:border-red-500"
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
                className="text-black bg-white border-red-300 focus:border-red-500"
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
                className="text-black bg-white border-purple-300"
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
                className="text-black bg-white border-purple-300"
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
          
          <div className="flex items-center space-x-2">
            <Switch
              id="autoTradingEnabled"
              checked={settings.auto_trading_enabled}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, auto_trading_enabled: checked }))}
            />
            <Label htmlFor="autoTradingEnabled" className="text-purple-800 font-semibold">🤖 Автоторговля (Фандинг бот)</Label>
          </div>
        </div>

        {/* КНОПКА СОХРАНЕНИЯ */}
        <Button 
          onClick={saveSettings} 
          disabled={loading}
          className="w-full h-12 text-lg font-bold"
        >
          {loading ? "💾 Сохранение..." : "💾 Сохранить настройки"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default TradingSettings;