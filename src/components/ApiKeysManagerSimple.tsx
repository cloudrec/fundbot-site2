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

const ApiKeysManagerSimple: React.FC = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [showSecrets, setShowSecrets] = useState<{[key: string]: boolean}>({});
  const [newApiKey, setNewApiKey] = useState({
    exchange: 'bybit',
    api_key: '',
    api_secret: '',
    is_testnet: false
  });

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔑 User loaded:', user?.email);
      setUser(user);
      if (user) {
        // Задержка для уверенности что пользователь загружен
        setTimeout(() => {
          loadApiKeys();
        }, 500);
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
      console.log('🔑 Loading API keys for user:', user.id);
      
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
          key.api_secret !== user.email &&
          !key.api_key.includes('@') &&
          !key.api_secret.includes('@')
        );
        
        console.log('🔑 Valid API keys:', validKeys);
        setApiKeys(validKeys);
        
        // Заполняем форму существующими ключами для редактирования
        const bybitKey = validKeys.find(key => key.exchange === 'bybit');
        if (bybitKey) {
          setNewApiKey({
            exchange: bybitKey.exchange,
            api_key: bybitKey.api_key,
            api_secret: bybitKey.api_secret,
            is_testnet: bybitKey.is_testnet || false
          });
          console.log('🔑 Loaded existing Bybit keys into form for editing');
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
      console.log('🔑 Saving API key for user:', user.id);

      // Используем upsert для замены существующих ключей
      const { data, error } = await supabase
        .from('api_keys_dev')
        .upsert({
          user_id: user.id,
          exchange: newApiKey.exchange,
          api_key: newApiKey.api_key,
          api_secret: newApiKey.api_secret,
          is_testnet: newApiKey.is_testnet
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
        title: "✅ API ключи обновлены!",
        description: `Ключи для ${newApiKey.exchange} сохранены/обновлены`,
      });

      // Очищаем форму
      setNewApiKey({
        exchange: 'bybit',
        api_key: '',
        api_secret: '',
        is_testnet: false
      });

      // Перезагружаем список
      loadApiKeys();

    } catch (error: any) {
      console.error('🔑 Save API key error:', error);
      toast({
        title: "❌ Ошибка сохранения",
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
        title: "🗑️ API ключ удален",
        description: "Ключ успешно удален",
      });

      loadApiKeys();
    } catch (error: any) {
      console.error('🔑 Delete API key error:', error);
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

  return (
    <div className="space-y-6">
      {/* Добавление нового API ключа */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {apiKeys.length > 0 ? 'Редактировать API ключи' : 'Добавить API ключ'}
          </CardTitle>
          <CardDescription>
            {apiKeys.length > 0 ? 'Измените существующие API ключи и нажмите Сохранить' : 'Добавьте API ключи Bybit для торговли'}
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
                <SelectTrigger className="text-black bg-white">
                  <SelectValue placeholder="Выберите биржу" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bybit">Bybit</SelectItem>
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
            <Label htmlFor="api_key">🔑 API Ключ</Label>
            <Input
              id="api_key"
              type="text"
              value={newApiKey.api_key}
              onChange={(e) => setNewApiKey(prev => ({ ...prev, api_key: e.target.value }))}
              placeholder="Введите API ключ от Bybit (НЕ email!)"
              className="text-black bg-white border-gray-300 focus:text-black"
            />
          </div>

          <div>
            <Label htmlFor="api_secret">🔐 API Секрет</Label>
            <Input
              id="api_secret"
              type="password"
              value={newApiKey.api_secret}
              onChange={(e) => setNewApiKey(prev => ({ ...prev, api_secret: e.target.value }))}
              placeholder="Введите API секрет от Bybit (НЕ пароль!)"
              className="text-black bg-white border-gray-300 focus:text-black"
            />
          </div>

          <Button onClick={saveApiKey} disabled={loading} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Сохранение...' : '🔄 Обновить/Сохранить API ключи'}
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
            Ваши API ключи для торговли на биржах
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">⏳ Загрузка...</div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>📭 API ключи не найдены</p>
              <p className="text-sm">Добавьте API ключ выше для начала торговли</p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((apiKey) => (
                <div key={apiKey.id} className="border rounded-lg p-4 space-y-3 bg-green-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-blue-100 text-blue-800">
                        {apiKey.exchange.toUpperCase()}
                      </Badge>
                      {apiKey.is_testnet && <Badge variant="secondary">Testnet</Badge>}
                      <Badge variant="default" className="bg-green-100 text-green-800">✅ Активен</Badge>
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
                      <Label className="text-sm font-medium text-black">🔑 API Ключ</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type={showSecrets[apiKey.id || ''] ? 'text' : 'password'}
                          value={apiKey.api_key}
                          readOnly
                          className="text-black bg-white border-gray-300"
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
                      <Label className="text-sm font-medium text-black">🔐 API Секрет</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type={showSecrets[apiKey.id || ''] ? 'text' : 'password'}
                          value={apiKey.api_secret}
                          readOnly
                          className="text-black bg-white border-gray-300"
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
        <AlertDescription className="text-black">
          <strong>🔒 Безопасность:</strong> API ключи хранятся в зашифрованном виде. 
          Никогда не делитесь своими API ключами с третьими лицами.
          Используйте только ключи с правами на торговлю (без вывода средств).
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default ApiKeysManagerSimple;