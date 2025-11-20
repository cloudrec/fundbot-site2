import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Settings, Save } from 'lucide-react';

const ConfigTab = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState({
    telegram_enabled: false,
    telegram_bot_token: '',
    telegram_chat_id: '',
    auto_trading_enabled: true,
    max_daily_trades: 50,
    risk_management_enabled: true,
    max_position_size_usd: 1000,
    stop_loss_enabled: true,
    take_profit_enabled: true,
    funding_threshold: 0.01
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('system_config_2025_11_12_05_30')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Ошибка загрузки конфигурации:', error);
        return;
      }
      
      if (data) {
        setConfig(prev => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error('Ошибка загрузки конфигурации:', error);
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_config_2025_11_12_05_30')
        .upsert({
          user_id: user?.id,
          ...config,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      
      toast({
        title: "✅ Конфигурация сохранена",
        description: "Настройки успешно обновлены",
      });
    } catch (error: any) {
      toast({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            ⚙️ Общие Настройки
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Автоторговля */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-300">Автоматическая торговля</Label>
              <p className="text-sm text-gray-400">Включить автоматическое размещение ордеров</p>
            </div>
            <Switch
              checked={config.auto_trading_enabled}
              onCheckedChange={(checked) => handleConfigChange('auto_trading_enabled', checked)}
            />
          </div>

          {/* Риск-менеджмент */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-300">Риск-менеджмент</Label>
              <p className="text-sm text-gray-400">Включить систему управления рисками</p>
            </div>
            <Switch
              checked={config.risk_management_enabled}
              onCheckedChange={(checked) => handleConfigChange('risk_management_enabled', checked)}
            />
          </div>

          {/* Максимальные сделки в день */}
          <div>
            <Label className="text-gray-300">Максимум сделок в день</Label>
            <Input
              type="number"
              min="1"
              max="200"
              value={config.max_daily_trades}
              onChange={(e) => handleConfigChange('max_daily_trades', Number(e.target.value))}
              className="bg-gray-700 border-gray-600 mt-2"
            />
          </div>

          {/* Максимальный размер позиции */}
          <div>
            <Label className="text-gray-300">Максимальный размер позиции (USD)</Label>
            <Input
              type="number"
              min="10"
              max="50000"
              value={config.max_position_size_usd}
              onChange={(e) => handleConfigChange('max_position_size_usd', Number(e.target.value))}
              className="bg-gray-700 border-gray-600 mt-2"
            />
          </div>

          {/* Порог фандинга */}
          <div>
            <Label className="text-gray-300">Минимальная ставка фандинга (%)</Label>
            <Input
              type="number"
              step="0.001"
              min="0.001"
              max="1"
              value={config.funding_threshold}
              onChange={(e) => handleConfigChange('funding_threshold', Number(e.target.value))}
              className="bg-gray-700 border-gray-600 mt-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Telegram настройки */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">📱 Telegram Уведомления</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-300">Включить Telegram уведомления</Label>
              <p className="text-sm text-gray-400">Получать уведомления о сделках в Telegram</p>
            </div>
            <Switch
              checked={config.telegram_enabled}
              onCheckedChange={(checked) => handleConfigChange('telegram_enabled', checked)}
            />
          </div>

          {config.telegram_enabled && (
            <>
              <div>
                <Label className="text-gray-300">Bot Token</Label>
                <Input
                  type="password"
                  value={config.telegram_bot_token}
                  onChange={(e) => handleConfigChange('telegram_bot_token', e.target.value)}
                  className="bg-gray-700 border-gray-600 mt-2"
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                />
              </div>

              <div>
                <Label className="text-gray-300">Chat ID</Label>
                <Input
                  value={config.telegram_chat_id}
                  onChange={(e) => handleConfigChange('telegram_chat_id', e.target.value)}
                  className="bg-gray-700 border-gray-600 mt-2"
                  placeholder="123456789"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Кнопка сохранения */}
      <Button onClick={saveConfig} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
        <Save className="h-4 w-4 mr-2" />
        Сохранить конфигурацию
      </Button>
    </div>
  );
};

export default ConfigTab;
