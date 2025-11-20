import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import GateApiSetupGuide from './GateApiSetupGuide';
import { Key, Save, Eye, EyeOff, Trash2 } from 'lucide-react';

const ApiKeysWithPassphrase: React.FC = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [showSecrets, setShowSecrets] = useState<{[key: string]: boolean}>({});
  const [formData, setFormData] = useState({
    exchange: 'bybit',
    api_key: '',
    api_secret: '',
    passphrase: '',
    is_testnet: false
  });

  useEffect(() => {
    checkUserAndLoadKeys();
  }, []);

  const checkUserAndLoadKeys = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔑🔥 User check:', user?.email);
      
      if (user) {
        setUser(user);
        
        setTimeout(async () => {
          await forceLoadApiKeys(user.id);
        }, 300);
      }
    } catch (error) {
      console.error('🔑🔥 User check error:', error);
    }
  };

  const forceLoadApiKeys = async (userId: string) => {
    try {
      console.log('🔑🔥 FORCE LOADING API KEYS FOR:', userId);
      
      const { data, error } = await supabase
        .from('api_keys_dev')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      console.log('🔑🔥 Raw DB response:', { data, error });

      if (error) {
        console.error('🔑🔥 DB Error:', error);
        throw error;
      }

      if (data && data.length > 0) {
        console.log('🔑🔥 Found API keys:', data);
        setApiKeys(data);
      } else {
        console.log('🔑🔥 No API keys found in DB');
        setApiKeys([]);
      }
    } catch (error: any) {
      console.error('🔑🔥 Force load error:', error);
      toast({
        title: "Ошибка загрузки ключей",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadExchangeKeys = (exchange: string) => {
    const exchangeKey = apiKeys.find(key => key.exchange === exchange);
    if (exchangeKey) {
      setFormData({
        exchange: exchangeKey.exchange,
        api_key: exchangeKey.api_key || '',
        api_secret: exchangeKey.api_secret || '',
        passphrase: exchangeKey.passphrase || '',
        is_testnet: exchangeKey.is_testnet || false
      });
      console.log('🔑🔥 Loaded', exchange, 'keys into form');
    } else {
      setFormData({
        exchange: exchange,
        api_key: '',
        api_secret: '',
        passphrase: '',
        is_testnet: false
      });
      console.log('🔑🔥 Cleared form for new exchange:', exchange);
    }
  };

  const saveApiKeys = async () => {
    try {
      if (!user?.id) {
        throw new Error('Пользователь не авторизован');
      }

      if (!formData.api_key || !formData.api_secret) {
        throw new Error('Введите API ключ и секрет');
      }

      // Проверка passphrase для KuCoin и OKX
      if ((formData.exchange === 'kucoin' || formData.exchange === 'okx') && !formData.passphrase) {
        throw new Error(`Для ${formData.exchange.toUpperCase()} требуется пароль API (passphrase)`);
      }

      if (formData.api_key.includes('@') || formData.api_secret.includes('@')) {
        throw new Error('API ключи не должны содержать @. Это НЕ email!');
      }

      setLoading(true);
      console.log('🔑🔥 Saving API keys:', {
        user_id: user.id,
        exchange: formData.exchange,
        api_key: formData.api_key.substring(0, 10) + '...',
        has_passphrase: !!formData.passphrase,
        is_testnet: formData.is_testnet
      });

      const { data, error } = await supabase
        .from('api_keys_dev')
        .upsert({
          user_id: user.id,
          exchange: formData.exchange,
          api_key: formData.api_key,
          api_secret: formData.api_secret,
          passphrase: formData.passphrase || null,
          is_testnet: formData.is_testnet
        }, {
          onConflict: 'user_id,exchange'
        })
        .select();

      if (error) {
        console.error('🔑🔥 Save error:', error);
        throw error;
      }

      console.log('🔑🔥 Saved successfully:', data);

      toast({
        title: "✅ API ключи сохранены!",
        description: `Ключи ${formData.exchange.toUpperCase()} успешно сохранены/обновлены`,
      });

      await forceLoadApiKeys(user.id);

    } catch (error: any) {
      console.error('🔑🔥 Save error:', error);
      toast({
        title: "❌ Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteApiKey = async (id: string, exchange: string) => {
    try {
      setLoading(true);
      console.log('🔑🔥 Deleting API key:', id, exchange);

      const { error } = await supabase
        .from('api_keys_dev')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "🗑️ API ключ удален",
        description: `Ключи ${exchange.toUpperCase()} удалены`,
      });

      await forceLoadApiKeys(user.id);
      
      if (formData.exchange === exchange) {
        setFormData({
          exchange: 'bybit',
          api_key: '',
          api_secret: '',
          passphrase: '',
          is_testnet: false
        });
      }

    } catch (error: any) {
      console.error('🔑🔥 Delete error:', error);
      toast({
        title: "❌ Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleShowSecret = (keyId: string) => {
    setShowSecrets(prev => ({
      ...prev,
      [keyId]: !prev[keyId]
    }));
  };

  const needsPassphrase = (exchange: string) => {
    return exchange === 'kucoin' || exchange === 'okx';
  };

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🔑 API Ключи</CardTitle>
          <CardDescription>Войдите в систему для управления API ключами</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Проверяем есть ли Gate.io ключи
  const hasGateKeys = apiKeys.some(key => key.exchange === 'gate');
  const showGateGuide = formData.exchange === 'gate' && !hasGateKeys;

  return (
    <div className="space-y-6">
      {/* Инструкция для Gate.io */}
      {showGateGuide && (
        <GateApiSetupGuide />
      )}
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            🔑 Управление API ключами (БОЕВОЙ РЕЖИМ)
          </CardTitle>
          <CardDescription>
            Добавьте реальные API ключи для торговли на биржах. Все операции РЕАЛЬНЫЕ!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="exchange">🏢 Биржа</Label>
            <Select 
              value={formData.exchange} 
              onValueChange={(value) => {
                setFormData(prev => ({ ...prev, exchange: value }));
                loadExchangeKeys(value);
              }}
            >
              <SelectTrigger className="text-black bg-white">
                <SelectValue placeholder="Выберите биржу" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bybit">🔥 Bybit (полная поддержка)</SelectItem>
                <SelectItem value="binance">⚡ Binance (боевой режим)</SelectItem>
                <SelectItem value="okx">🚀 OKX (боевой режим)</SelectItem>
                <SelectItem value="gate">🌟 Gate.io (боевой режим)</SelectItem>
                <SelectItem value="kucoin">💎 KuCoin (боевой режим)</SelectItem>
                <SelectItem value="mexc">🔴 MEXC (боевой режим)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2 mb-4">
            <input
              type="checkbox"
              id="testnet"
              checked={formData.is_testnet}
              onChange={(e) => setFormData(prev => ({ ...prev, is_testnet: e.target.checked }))}
            />
            <Label htmlFor="testnet">🧪 Тестовая сеть (если поддерживается)</Label>
          </div>

          <div>
            <Label htmlFor="api_key">🔑 API Ключ</Label>
            <Input
              id="api_key"
              type="text"
              value={formData.api_key}
              onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
              placeholder={`Введите API ключ от ${formData.exchange.toUpperCase()}`}
              className="text-black bg-white border-gray-300 focus:text-black"
            />
          </div>

          <div>
            <Label htmlFor="api_secret">🔐 API Секрет</Label>
            <Input
              id="api_secret"
              type="password"
              value={formData.api_secret}
              onChange={(e) => setFormData(prev => ({ ...prev, api_secret: e.target.value }))}
              placeholder={`Введите API секрет от ${formData.exchange.toUpperCase()}`}
              className="text-black bg-white border-gray-300 focus:text-black"
            />
          </div>

          {needsPassphrase(formData.exchange) && (
            <div>
              <Label htmlFor="passphrase">🔒 Пароль API (Passphrase)</Label>
              <Input
                id="passphrase"
                type="password"
                value={formData.passphrase}
                onChange={(e) => setFormData(prev => ({ ...prev, passphrase: e.target.value }))}
                placeholder={`Введите пароль API для ${formData.exchange.toUpperCase()}`}
                className="text-black bg-white border-gray-300 focus:text-black"
              />
              <p className="text-sm text-gray-600 mt-1">
                ⚠️ Обязательное поле для {formData.exchange.toUpperCase()}
              </p>
            </div>
          )}

          <Button onClick={saveApiKeys} disabled={loading} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Сохранение...' : `💾 Сохранить ключи ${formData.exchange.toUpperCase()}`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>📋 Сохраненные API ключи</CardTitle>
          <CardDescription>Всего бирж: {apiKeys.length} (ВСЕ В БОЕВОМ РЕЖИМЕ)</CardDescription>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-black">📭 API ключи не найдены</p>
              <p className="text-sm text-black">Добавьте API ключи выше для начала торговли</p>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((apiKey) => (
                <div key={apiKey.id} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-red-100 text-red-800">
                        {apiKey.exchange.toUpperCase()} 🔥 БОЕВОЙ
                      </Badge>
                      {apiKey.is_testnet && <Badge variant="secondary">Testnet</Badge>}
                      <Badge className="bg-green-100 text-green-800">✅ Активен</Badge>
                      {apiKey.passphrase && <Badge className="bg-blue-100 text-blue-800">🔒 С паролем</Badge>}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadExchangeKeys(apiKey.exchange)}
                      >
                        ✏️ Редактировать
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteApiKey(apiKey.id, apiKey.exchange)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-black">🔑 API Ключ</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type={showSecrets[apiKey.id] ? 'text' : 'password'}
                          value={apiKey.api_key}
                          readOnly
                          className="text-black bg-white border-gray-300"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleShowSecret(apiKey.id)}
                        >
                          {showSecrets[apiKey.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-black">🔐 API Секрет</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type={showSecrets[apiKey.id] ? 'text' : 'password'}
                          value={apiKey.api_secret}
                          readOnly
                          className="text-black bg-white border-gray-300"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleShowSecret(apiKey.id)}
                        >
                          {showSecrets[apiKey.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    {apiKey.passphrase && (
                      <div className="md:col-span-2">
                        <Label className="text-sm font-medium text-black">🔒 Пароль API</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type={showSecrets[apiKey.id] ? 'text' : 'password'}
                            value={apiKey.passphrase}
                            readOnly
                            className="text-black bg-white border-gray-300"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleShowSecret(apiKey.id)}
                          >
                            {showSecrets[apiKey.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-2 text-sm text-black">
                    📅 Создан: {new Date(apiKey.created_at).toLocaleString('ru-RU')}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-black">
              <strong>🔥 ВНИМАНИЕ:</strong> Все биржи работают в БОЕВОМ РЕЖИМЕ! 
              Всего ключей: <strong>{apiKeys.length}</strong>
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => user && forceLoadApiKeys(user.id)}
              className="mt-2"
            >
              🔄 Принудительно перезагрузить
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApiKeysWithPassphrase;