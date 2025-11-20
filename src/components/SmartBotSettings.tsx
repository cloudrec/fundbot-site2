import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Brain, Save, RefreshCw, TrendingUp, TrendingDown, TestTube } from 'lucide-react';

interface SmartBotSettingsProps {
  user: any;
}

interface SmartBotSettings {
  id?: string;
  enabled: boolean;
  order_amount_usd: number;
  leverage: number;
  take_profit_percent: number;
  stop_loss_percent: number;
  max_position_time_minutes: number;
  min_funding_rate: number;
  max_positions_per_exchange: number;
  exchanges: string[]; // Добавлено для чекбоксов бирж
}

const defaultSettings: SmartBotSettings = {
  enabled: false,
  order_amount_usd: 100,
  leverage: 10,
  take_profit_percent: 2.0,
  stop_loss_percent: 5.0,
  max_position_time_minutes: 60,
  min_funding_rate: 0.5,
  max_positions_per_exchange: 3,
  exchanges: ['binance', 'bybit', 'gate', 'kucoin', 'okx', 'mexc'], // По умолчанию все биржи
};

const SmartBotSettings: React.FC<SmartBotSettingsProps> = ({ user }) => {
  const [settings, setSettings] = useState<SmartBotSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('smart_bot_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings({
          ...data,
          exchanges: data.exchanges || ['binance', 'bybit', 'gate', 'kucoin', 'okx', 'mexc'], // По умолчанию все биржи
        });
      }
    } catch (error: any) {
      console.error('Ошибка загрузки настроек Smart Bot:', error);
      toast({
        title: "Ошибка загрузки настроек",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!user) {
      toast({
        title: "Ошибка",
        description: "Необходимо войти в систему",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      const settingsToSave = {
        ...settings,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('smart_bot_settings')
        .upsert(settingsToSave);

      if (error) throw error;

      toast({
        title: "Настройки сохранены",
        description: "Smart Bot настройки успешно обновлены",
      });
    } catch (error: any) {
      console.error('Ошибка сохранения настроек:', error);
      toast({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Функция для переключения бирж Smart Bot
  const toggleExchange = (exchange: string) => {
    const newExchanges = settings.exchanges.includes(exchange)
      ? settings.exchanges.filter(e => e !== exchange)
      : [...settings.exchanges, exchange];
      
    const newSettings = {
      ...settings,
      exchanges: newExchanges
    };
    
    setSettings(newSettings);
    
    // 💾 Автоматически сохраняем настройки Smart Bot
    saveSmartExchanges(newSettings);
  };
  
  // Функция сохранения настроек бирж Smart Bot
  const saveSmartExchanges = async (newSettings: SmartBotSettings) => {
    try {
      if (!user?.id) return;

      const { error } = await supabase
        .from('smart_bot_settings')
        .upsert({
          user_id: user.id,
          ...newSettings,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('📊 SMART BOT: Error saving exchanges:', error);
      } else {
        console.log('📊 SMART BOT: Exchanges saved:', newSettings.exchanges);
      }
    } catch (error) {
      console.error('📊 SMART BOT: Error in saveSmartExchanges:', error);
    }
  };
  
  // Функции тестирования Smart Bot
  const testSmartLong = async () => {
    setLoading(true);
    try {
      if (!user?.id) return;

      const { data, error } = await supabase.functions.invoke('smart_bot_fixed_api_keys_2025_11_10_08_05', {
        body: {
          action: 'test_long',
          user_id: user.id
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "✅ Тест LONG выполнен",
          description: data.message || 'Тестовый LONG ордер Smart бота размещен',
        });
      } else {
        throw new Error(data?.error || 'Ошибка теста LONG');
      }
    } catch (error) {
      console.error('Error testing smart LONG:', error);
      toast({
        title: "❌ Ошибка теста LONG",
        description: "Не удалось выполнить тестовый LONG ордер",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const testSmartShort = async () => {
    setLoading(true);
    try {
      if (!user?.id) return;

      const { data, error } = await supabase.functions.invoke('smart_bot_fixed_api_keys_2025_11_10_08_05', {
        body: {
          action: 'test_short',
          user_id: user.id
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "✅ Тест SHORT выполнен",
          description: data.message || 'Тестовый SHORT ордер Smart бота размещен',
        });
      } else {
        throw new Error(data?.error || 'Ошибка теста SHORT');
      }
    } catch (error) {
      console.error('Error testing smart SHORT:', error);
      toast({
        title: "❌ Ошибка теста SHORT",
        description: "Не удалось выполнить тестовый SHORT ордер",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-600" />
            Smart Bot - Автономный анализ фандинга
          </CardTitle>
          <CardDescription>
            Умный бот автоматически анализирует ставки фандинга и принимает решения о входе в LONG или SHORT позиции
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Включение/выключение бота */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label className="text-base font-medium">Статус Smart Bot</Label>
              <p className="text-sm text-muted-foreground">
                Включить автоматический анализ и торговлю
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))}
              />
              <Badge variant={settings.enabled ? "default" : "secondary"}>
                {settings.enabled ? 'АКТИВЕН' : 'ВЫКЛЮЧЕН'}
              </Badge>
            </div>
          </div>

          {/* Торговые параметры */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Размер ордера (USD)</Label>
              <Input
                type="number"
                value={settings.order_amount_usd}
                onChange={(e) => setSettings(prev => ({ ...prev, order_amount_usd: parseFloat(e.target.value) || 0 }))}
                min="10"
                max="10000"
              />
            </div>

            <div className="space-y-2">
              <Label>Плечо (x)</Label>
              <Select 
                value={settings.leverage.toString()} 
                onValueChange={(value) => setSettings(prev => ({ 
                  ...prev, 
                  leverage: parseInt(value) || 10 
                }))}
              >
                <SelectTrigger>
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
            </div>

            <div className="space-y-2">
              <Label>Take Profit (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={settings.take_profit_percent}
                onChange={(e) => setSettings(prev => ({ ...prev, take_profit_percent: parseFloat(e.target.value) || 0 }))}
                min="0.1"
                max="50"
              />
            </div>

            <div className="space-y-2">
              <Label>Stop Loss (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={settings.stop_loss_percent}
                onChange={(e) => setSettings(prev => ({ ...prev, stop_loss_percent: parseFloat(e.target.value) || 0 }))}
                min="0.1"
                max="50"
              />
            </div>

            <div className="space-y-2">
              <Label>Максимальное время позиции (минуты)</Label>
              <Input
                type="number"
                value={settings.max_position_time_minutes}
                onChange={(e) => setSettings(prev => ({ ...prev, max_position_time_minutes: parseInt(e.target.value) || 0 }))}
                min="5"
                max="1440"
              />
            </div>

            <div className="space-y-2">
              <Label>Минимальная ставка фандинга (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={settings.min_funding_rate}
                onChange={(e) => setSettings(prev => ({ ...prev, min_funding_rate: parseFloat(e.target.value) || 0 }))}
                min="0.01"
                max="5"
              />
            </div>
          </div>

          {/* Чекбоксы бирж для Smart Bot */}
          <div className="space-y-3">
            <Label className="text-base font-medium">🤖 Биржи для Smart Bot</Label>
            <div className="flex flex-wrap gap-2">
              {['binance', 'bybit', 'gate', 'kucoin', 'okx', 'mexc'].map((exchange) => (
                <Badge
                  key={exchange}
                  variant={settings.exchanges.includes(exchange) ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1 hover:scale-105 transition-transform"
                  onClick={() => toggleExchange(exchange)}
                >
                  {exchange.toUpperCase()}
                  {settings.exchanges.includes(exchange) && ' ✓'}
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              📊 Выберите биржи для автономного анализа Smart Bot (независимо от торговой панели)
            </p>
          </div>
          
          {/* Кнопки тестирования */}
          <div className="space-y-3">
            <Label className="text-base font-medium flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              Тестирование Smart бота
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Button 
                onClick={testSmartLong}
                disabled={loading}
                variant="default" 
                className="h-12 glow-primary"
              >
                <div className="text-center">
                  <TrendingUp className="h-4 w-4 mx-auto mb-1" />
                  <div className="text-sm">🟢 Тест LONG</div>
                  <div className="text-xs opacity-75">Smart бот</div>
                </div>
              </Button>
              <Button 
                onClick={testSmartShort}
                disabled={loading}
                variant="destructive" 
                className="h-12 glow-destructive"
              >
                <div className="text-center">
                  <TrendingDown className="h-4 w-4 mx-auto mb-1" />
                  <div className="text-sm">🔴 Тест SHORT</div>
                  <div className="text-xs opacity-75">Smart бот</div>
                </div>
              </Button>
            </div>
          </div>

          {/* Кнопки управления */}
          <div className="flex space-x-4">
            <Button onClick={saveSettings} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              Сохранить настройки
            </Button>
            
            <Button onClick={loadSettings} disabled={loading} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SmartBotSettings;