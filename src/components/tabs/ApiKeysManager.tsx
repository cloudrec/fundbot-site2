import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

const ApiKeysManager: React.FC = () => {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, any>>({
    bybit: { apiKey: "test_bybit_key_12345", secret: "test_bybit_secret_67890", passphrase: "test_passphrase", testnet: false },
    binance: { apiKey: "test_binance_key_12345", secret: "test_binance_secret_67890", passphrase: "", testnet: false },
    gate: { apiKey: '', secret: '', passphrase: '', testnet: false },
    kucoin: { apiKey: '', secret: '', passphrase: '', testnet: false },
    okx: { apiKey: '', secret: '', passphrase: '', testnet: false },
    mexc: { apiKey: '', secret: '', passphrase: '', testnet: false },
    bitget: { apiKey: '', secret: '', passphrase: '', testnet: false },
    huobi: { apiKey: '', secret: '', passphrase: '', testnet: false }
  });

  const exchanges = [
    { id: 'bybit', name: 'Bybit', icon: '🟡', needsPassphrase: false },
    { id: 'binance', name: 'Binance', icon: '🟨', needsPassphrase: false },
    { id: 'gate', name: 'Gate.io', icon: '🟦', needsPassphrase: true },
    { id: 'kucoin', name: 'KuCoin', icon: '🟢', needsPassphrase: true },
    { id: 'okx', name: 'OKX', icon: '🔵', needsPassphrase: true },
    { id: 'mexc', name: 'MEXC', icon: '🔴', needsPassphrase: false },
    { id: 'bitget', name: 'Bitget', icon: '🟪', needsPassphrase: true },
    { id: 'huobi', name: 'Huobi', icon: '🟧', needsPassphrase: false }
  ];

  useEffect(() => {
    console.log("🚀 ApiKeysManager загружен");
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    console.log("🔍 Начинаю загрузку API ключей");
    try {
      const { data, error } = await supabase
        .from('api_keys_2025_11_12_05_30')
        .select('*');

      console.log("🔍 Запрос выполнен, data:", data, "error:", error);
      if (error) {
        console.error('Ошибка загрузки API ключей:', error);
        return;
      }

      if (data && data.length > 0) {
        console.log("🔍 Обрабатываю", data.length, "записей из базы:");
        const loadedKeys = {};
        data.forEach(item => {
          console.log("🔍 Полная запись:", item);
          console.log("🔍 exchange:", item.exchange, "api_key:", item.api_key?.substring(0,8));
          const exchangeKey = item.exchange || item.exchange_name || item.name;
          if (!exchangeKey) {
            console.warn("⚠️ Пропускаю запись без exchange:", item);
            return;
          }
          loadedKeys[exchangeKey] = {
            apiKey: item.api_key || '',
            secret: item.secret_key || '',
            passphrase: item.passphrase || '',
            testnet: item.testnet || false
          };
        });
        console.log("🔍 Финальный keysMap для установки:", loadedKeys);
        setApiKeys(prev => ({ ...prev, ...loadedKeys }));
        console.log("✅ setApiKeys выполнен, состояние должно обновиться");
      }
    } catch (error) {
      console.error('Ошибка при загрузке API ключей:', error);
    }
  };

  const saveApiKeys = async (exchange: string) => {
    setLoading(prev => ({ ...prev, [exchange]: true }));
    
    try {
      const keys = apiKeys[exchange];
      
      const { error } = await supabase
        .from('api_keys_2025_11_12_05_30')
        .upsert({
          exchange: exchange,
          api_key: keys.apiKey,
          secret_key: keys.secret,
          passphrase: keys.passphrase,
          testnet: keys.testnet,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'exchange'
        });

      if (error) throw error;
      console.log(`API ключи для ${exchange} сохранены`);
    } catch (error) {
      console.error(`Ошибка сохранения ключей для ${exchange}:`, error);
    } finally {
      setLoading(prev => ({ ...prev, [exchange]: false }));
    }
  };

  const updateApiKey = (exchange: string, field: string, value: string | boolean) => {
    setApiKeys(prev => ({
      ...prev,
      [exchange]: {
        ...prev[exchange],
        [field]: value
      }
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            🔑 Управление API Ключами (8 бирж)
          </CardTitle>
          <p className="text-muted-foreground">
            Настройте API ключи для всех поддерживаемых бирж
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {exchanges.map((exchange) => (
              <Card key={exchange.id} className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{exchange.icon}</div>
                    <h3 className="text-lg font-semibold">{exchange.name}</h3>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowKeys(prev => ({ ...prev, [exchange.id]: !prev[exchange.id] }))}
                    >
                      {showKeys[exchange.id] ? '🙈 Скрыть' : '👁️ Показать'}
                    </Button>
                    <Button
                      onClick={() => saveApiKeys(exchange.id)}
                      disabled={loading[exchange.id]}
                      size="sm"
                    >
                      {loading[exchange.id] ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>API Key</Label>
                    <Input
                      type={showKeys[exchange.id] ? 'text' : 'password'}
                      placeholder="Введите API ключ"
                      value={apiKeys[exchange.id]?.apiKey || ''}
                      onChange={(e) => updateApiKey(exchange.id, 'apiKey', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Secret Key</Label>
                    <Input
                      type={showKeys[exchange.id] ? 'text' : 'password'}
                      placeholder="Введите секретный ключ"
                      value={apiKeys[exchange.id]?.secret || ''}
                      onChange={(e) => updateApiKey(exchange.id, 'secret', e.target.value)}
                    />
                  </div>
                  {exchange.needsPassphrase && (
                    <div>
                      <Label>Passphrase</Label>
                      <Input
                        type={showKeys[exchange.id] ? 'text' : 'password'}
                        placeholder="Введите passphrase"
                        value={apiKeys[exchange.id]?.passphrase || ''}
                        onChange={(e) => updateApiKey(exchange.id, 'passphrase', e.target.value)}
                      />
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={apiKeys[exchange.id]?.testnet || false}
                      onChange={(e) => updateApiKey(exchange.id, 'testnet', e.target.checked)}
                    />
                    <Label>Testnet</Label>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApiKeysManager;
