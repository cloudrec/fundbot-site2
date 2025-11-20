import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';

const FundingBot = () => {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState({
    min_funding_rate: "0.3",
    max_funding_rate: "10.0",
    scan_interval_minutes: 60,
    telegram_notifications: true,
    auto_scan_enabled: true,
    min_volume_24h: 1000000
  });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [timeToNextScan, setTimeToNextScan] = useState('');

  useEffect(() => {
    loadSettings();
    loadLatestResults();
    updateNextScanTime();
    
    const interval = setInterval(() => {
      loadLatestResults();
      updateNextScanTime();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const updateNextScanTime = () => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    const scanTime = new Date(nextHour.getTime() - 20 * 60 * 1000);
    
    if (now > scanTime) {
      scanTime.setHours(scanTime.getHours() + 1);
    }
    
    const diff = scanTime.getTime() - now.getTime();
    const minutes = Math.floor(diff / 60000);
    setTimeToNextScan(minutes + ' мин');
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('combat_funding_scanner_2025_11_17_15_30', {
        body: { action: 'get_settings' }
      });
      if (error) throw error;
      if (data.success && data.settings) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
    }
  };

  const loadLatestResults = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('combat_funding_scanner_2025_11_17_15_30', {
        body: { action: 'get_latest_results' }
      });
      if (error) throw error;
      if (data.success) {
        setOpportunities(data.opportunities || []);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Ошибка загрузки результатов:', error);
    }
  };

  const saveSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('combat_funding_scanner_2025_11_17_15_30', {
        body: { 
          action: 'update_settings',
          user_id: user?.id || "demo-user",
          settings: settings
        }
      });
      if (error) throw error;
      toast({ title: 'Настройки сохранены', description: 'Параметры сканера обновлены в базе данных' });
    } catch (error) {
      toast({ title: 'Ошибка сохранения', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startManualScan = async () => {
    try {
      setScanning(true);
      toast({ title: 'Запуск сканирования фандинга', description: 'Сканируем 8 бирж на фандинг возможности...' });
      
      const { data, error } = await supabase.functions.invoke('combat_funding_scanner_2025_11_17_15_30', {
        body: { action: 'scan_funding', settings, scan_type: 'manual' }
      });
      
      if (error) throw error;
      
      if (data.success) {
        setOpportunities(data.opportunities || []);
        setStats(data.stats);
        const oppCount = data.opportunities ? data.opportunities.length : 0;
        
        toast({ 
          title: 'Сканирование завершено', 
          description: `Найдено ${oppCount} возможностей на ${data.stats?.total_exchanges || 0} биржах`
        });
        await loadLatestResults();
      }
    } catch (error) {
      toast({ title: 'Ошибка сканирования', description: error.message, variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const getExchangeEmoji = (exchange) => {
    const emojis = {
      'Binance': '🟡',
      'Bybit': '🟠', 
      'OKX': '🔵',
      'Gate.io': '🟢',
      'KuCoin': '🟣',
      'Huobi': '🔴',
      'MEXC': '🟤',
      'Bitget': '⚫'
    };
    return emojis[exchange] || '⚪';
  };

  const getFundingEmoji = (rate) => {
    return rate > 0 ? '🟢' : '🔴';
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">🔍 Сканер Фандингов</h1>
          <p className="text-gray-400 mt-1">8 бирж | Автосканирование каждый час за 20 мин до фандинга</p>
        </div>
        <div className="flex space-x-3">
          <Button onClick={startManualScan} disabled={scanning} className="bg-green-600 hover:bg-green-700">
            {scanning ? 'Сканирование...' : '🚀 ЗАПУСТИТЬ СКАНИРОВАНИЕ'}
          </Button>
          <Button onClick={loadLatestResults} variant="outline" className="border-gray-600">
            🔄 Обновить
          </Button>
        </div>
      </div>

      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">⏰ Автосканирование (каждый час за 20 мин до фандинга)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{timeToNextScan}</div>
              <div className="text-xs text-gray-400">До следующего сканирования</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">8/8</div>
              <div className="text-xs text-gray-400">Активных бирж</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">{opportunities.length}</div>
              <div className="text-xs text-gray-400">Найдено возможностей</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">{settings.min_funding_rate}%</div>
              <div className="text-xs text-gray-400">Минимальная ставка</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {stats && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">📊 Статистика последнего сканирования</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{stats.total_exchanges || 0}/8</div>
                <div className="text-xs text-gray-400">Биржи просканированы</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{stats.total_symbols || 0}</div>
                <div className="text-xs text-gray-400">Символы проверены</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{stats.positive_funding_count || 0}</div>
                <div className="text-xs text-gray-400">🟢 Лонг фандинги</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{stats.negative_funding_count || 0}</div>
                <div className="text-xs text-gray-400">🔴 Шорт фандинги</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{stats.scan_duration || 0}с</div>
                <div className="text-xs text-gray-400">Время сканирования</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">⚙️ Настройки сканера (редактируемые, сохраняются в БД)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-gray-300">Минимальная ставка фандинга (%)</Label>
              <Input
                type="text"
                step="0.1"
                value={settings.min_funding_rate}
                onChange={(e) => setSettings(prev => ({ ...prev, min_funding_rate: e.target.value }))}
                className="bg-gray-700 border-gray-600"
              />
            </div>
            <div>
              <Label className="text-gray-300">Максимальная ставка фандинга (%)</Label>
              <Input
                type="text"
                step="1"
                value={settings.max_funding_rate}
                onChange={(e) => setSettings(prev => ({ ...prev, max_funding_rate: e.target.value }))}
                className="bg-gray-700 border-gray-600"
              />
            </div>
            <div>
              <Label className="text-gray-300">Минимальный объем 24ч (USD)</Label>
              <Input
                type="text"
                value={settings.min_volume_24h}
                onChange={(e) => setSettings(prev => ({ ...prev, min_volume_24h: e.target.value }))}
                className="bg-gray-700 border-gray-600"
              />
            </div>
            <div className="flex flex-col space-y-3">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={settings.telegram_notifications}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, telegram_notifications: checked }))}
                />
                <Label className="text-gray-300">Telegram уведомления</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={settings.auto_scan_enabled}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, auto_scan_enabled: checked }))}
                />
                <Label className="text-gray-300">Автосканирование</Label>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={saveSettings} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? 'Сохранение...' : '💾 Сохранить настройки в БД'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">💰 Найденные возможности фандинга</CardTitle>
        </CardHeader>
        <CardContent>
          {opportunities.length > 0 ? (
            <div className="space-y-3">
              {opportunities.map((opportunity, index) => (
                <div key={index} className="flex items-center justify-between" p-4 bg-gray-700 rounded-lg>
                  <div className="flex items-center space-x-4">
                    <Badge className="bg-blue-600">
                      {getExchangeEmoji(opportunity.exchange)} {opportunity.exchange}
                    </Badge>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-white" font-semibold>{opportunity.symbol}</span>
                        {opportunity.pair_url && (
                          <a 
                            href={opportunity.pair_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            🔗
                          </a>
                        )}
                      </div>
                      <div className="text-gray-400 text-sm">
                        ${opportunity.mark_price && opportunity.mark_price.toFixed ? opportunity.mark_price.toFixed(2) : 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-6">
                    <div className="text-center">
                      <div className={
                        opportunity.funding_rate > 0 ? 
                        'text-lg font-bold text-green-400' : 'text-lg font-bold text-red-400'
                      }>
                        {getFundingEmoji(opportunity.funding_rate)} {opportunity.funding_rate && opportunity.funding_rate.toFixed ? opportunity.funding_rate.toFixed(4) : '0.0000'}%
                      </div>
                      <div className="text-xs text-gray-400">
                        {opportunity.funding_rate > 0 ? 'лонг' : 'шорт'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-semibold text-yellow-400">
                        {opportunity.annual_rate && opportunity.annual_rate.toFixed ? opportunity.annual_rate.toFixed(2) : '0.00'}%
                      </div>
                      <div className="text-xs text-gray-400">годовых</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-300">
                        {(() => { const now = new Date(); const nextHour = new Date(now); nextHour.setHours(now.getHours() + 1, 0, 0, 0); return nextHour.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }); })()}
                      </div>
                      <div className="text-xs text-gray-400">следующий фандинг</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center" py-8>
              <p className="text-gray-400 text-lg">Возможности не найдены</p>
              <p className="text-gray-500 text-sm mt-2">
                Запустите сканирование или измените настройки фильтрации
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FundingBot;
