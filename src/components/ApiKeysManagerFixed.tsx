import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Key, 
  Eye, 
  EyeOff, 
  Save, 
  Trash2,
  Plus,
  CheckCircle
} from 'lucide-react';

interface ApiKey {
  id?: string;
  exchange: string;
  api_key: string;
  api_secret: string;
  passphrase?: string;
  is_testnet: boolean;
  is_active: boolean;
}

const ApiKeysManagerFixed: React.FC = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showSecrets, setShowSecrets] = useState<{[key: string]: boolean}>({});
  const [newApiKey, setNewApiKey] = useState<ApiKey>({
    exchange: 'bybit',
    api_key: '',
    api_secret: '',
    passphrase: '',
    is_testnet: false,
    is_active: true
  });

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔑 User loaded:', user?.email);
      setUser(user);
      if (user) {
        loadApiKeys();
      }
    };
    getUser();
  }, []);

  const loadApiKeys = async () => {
    try {
      if (!user?.id) {
        console.log('🔑 No user, skipping API keys load');
        return;
      }
      
      setLoading(true);
      console.log('🔑 Loading API keys for user:', user.id, user.email);
      
      const { data, error } = await supabase
        .from('api_keys_dev')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('🔑 Error loading API keys:', error);
        throw error;
      }
      
      console.log('🔑 Loaded API keys from DB:', data);
      
      if (data && data.length > 0) {
        // Проверяем что данные правильные
        const validKeys = data.filter(key => 
          key.api_key && 
          key.api_secret && 
          key.api_key !== user.email && 
          key.api_secret !== user.email
        );
        
        console.log('🔑 Valid API keys:', validKeys);
        setApiKeys(validKeys);
        
        if (validKeys.length !== data.length) {
          console.warn('🔑 Some API keys were invalid and filtered out');
        }
      } else {
        console.log('🔑 No API keys found');
        setApiKeys([]);
      }
    } catch (error: any) {
      console.error('🔑 Load API keys error:', error);
      toast({
        title: "Ошибка загрузки API ключей",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveApiKey = async () => {
    try {
      if (!user?.id) {
        throw new Error('Пользователь не авторизован');
      }

      if (!newApiKey.api_key || !newApiKey.api_secret) {
        throw new Error('API ключ и секрет обязательны');
      }

      // Проверяем что не вводят email вместо ключей
      if (newApiKey.api_key.includes('@') || newApiKey.api_secret.includes('@')) {
        throw new Error('API ключи не должны содержать символ @. Это не email адреса!');
      }

      setLoading(true);
      console.log('🔑 Saving API key:', {
        user_id: user.id,
        exchange: newApiKey.exchange,
        api_key: newApiKey.api_key.substring(0, 10) + '...',
        is_testnet: newApiKey.is_testnet
      });

      const { data, error } = await supabase
        .from('api_keys_dev')
        .upsert({
          user_id: user.id,
          exchange: newApiKey.exchange,
          api_key: newApiKey.api_key,
          api_secret: newApiKey.api_secret,
          passphrase: newApiKey.passphrase || null,
          is_testnet: newApiKey.is_testnet,
          is_active: newApiKey.is_active,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,exchange'
        })
        .select();

      if (error) {
        console.error('🔑 Error saving API key:', error);
        throw error;
      }

      console.log('🔑 API key saved successfully:', data);

      toast({
        title: "API ключ сохранен",
        description: `Ключи для ${newApiKey.exchange} успешно сохранены`,
      });

      // Очищаем форму
      setNewApiKey({
        exchange: 'bybit',
        api_key: '',
        api_secret: '',
        passphrase: '',
        is_testnet: false,
        is_active: true
      });

      // Перезагружаем список
      loadApiKeys();

    } catch (error: any) {
      console.error('🔑 Save API key error:', error);
      toast({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteApiKey = async (id: string) => {
    try {
      setLoading(true);
      console.log('🔑 Deleting API key:', id);

      const { error } = await supabase
        .from('api_keys_dev')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "API ключ удален",
        description: "Ключ успешно удален",
      });

      loadApiKeys();
    } catch (error: any) {
      console.error('🔑 Delete API key error:', error);
      toast({
        title: "Ошибка удаления",
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

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Ключи</CardTitle>
          <CardDescription>Войдите в систему для управления API ключами</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Добавление нового API ключа */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Добавить API ключ
          </CardTitle>
          <CardDescription>
            Добавьте API ключи для торговли на биржах
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="exchange">Биржа</Label>
              <Select 
                value={newApiKey.exchange} 
                onValueChange={(value) => setNewApiKey(prev => ({ ...prev, exchange: value }))}
              >
                <SelectTrigger>
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

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="testnet"
                checked={newApiKey.is_testnet}
                onChange={(e) => setNewApiKey(prev => ({ ...prev, is_testnet: e.target.checked }))}
              />
              <Label htmlFor="testnet">Тестовая сеть</Label>
            </div>
          </div>

          <div>
            <Label htmlFor="api_key">API Ключ</Label>
            <Input
              id="api_key"
              type="text"
              value={newApiKey.api_key}
              onChange={(e) => setNewApiKey(prev => ({ ...prev, api_key: e.target.value }))}
              placeholder="Введите API ключ (НЕ email!)"
              className="text-black bg-white border-gray-300 focus:text-black"
            />
          </div>

          <div>
            <Label htmlFor="api_secret">API Секрет</Label>
            <Input
              id="api_secret"
              type="password"
              value={newApiKey.api_secret}
              onChange={(e) => setNewApiKey(prev => ({ ...prev, api_secret: e.target.value }))}
              placeholder="Введите API секрет (НЕ пароль!)"
              className="text-black bg-white border-gray-300 focus:text-black"
            />
          </div>

          {(newApiKey.exchange === 'okx' || newApiKey.exchange === 'kucoin') && (
            <div>
              <Label htmlFor="passphrase">Passphrase (для {newApiKey.exchange.toUpperCase()})</Label>
              <Input
                id="passphrase"
                type="password"
                value={newApiKey.passphrase || ''}
                onChange={(e) => setNewApiKey(prev => ({ ...prev, passphrase: e.target.value }))}
                placeholder="Введите passphrase"
                className="text-black bg-white border-gray-300 focus:text-black"
              />
            </div>
          )}

          <Button onClick={saveApiKey} disabled={loading} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Сохранение...' : 'Сохранить API ключ'}
          </Button>
        </CardContent>
      </Card>

      {/* Список сохраненных API ключей */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Сохраненные API ключи
          </CardTitle>
          <CardDescription>
            Управление вашими API ключами для торговли
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Загрузка...</div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>API ключи не найдены</p>
              <p className="text-sm">Добавьте API ключ выше для начала торговли</p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((apiKey) => (
                <div key={apiKey.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{apiKey.exchange.toUpperCase()}</Badge>
                      {apiKey.is_testnet && <Badge variant="secondary">Testnet</Badge>}
                      {apiKey.is_active && <Badge variant="default" className="bg-green-100 text-green-800">Активен</Badge>}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => apiKey.id && deleteApiKey(apiKey.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium">API Ключ</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type={showSecrets[apiKey.id || ''] ? 'text' : 'password'}
                          value={apiKey.api_key}
                          readOnly
                          className="text-black bg-gray-50"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleShowSecret(apiKey.id || '')}
                        >
                          {showSecrets[apiKey.id || ''] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium">API Секрет</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type={showSecrets[apiKey.id || ''] ? 'text' : 'password'}
                          value={apiKey.api_secret}
                          readOnly
                          className="text-black bg-gray-50"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleShowSecret(apiKey.id || '')}
                        >
                          {showSecrets[apiKey.id || ''] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Безопасность:</strong> API ключи хранятся в зашифрованном виде. 
          Никогда не делитесь своими API ключами с третьими лицами.
          Используйте только ключи с правами на торговлю (без вывода средств).
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default ApiKeysManagerFixed;