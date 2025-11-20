import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Key, Save, Eye, EyeOff } from 'lucide-react';

const ApiKeysWorking: React.FC = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [formData, setFormData] = useState({
    api_key: '',
    api_secret: '',
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
        
        // Принудительная загрузка ключей
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
        .eq('user_id', userId);

      console.log('🔑🔥 Raw DB response:', { data, error });

      if (error) {
        console.error('🔑🔥 DB Error:', error);
        throw error;
      }

      if (data && data.length > 0) {
        console.log('🔑🔥 Found API keys:', data);
        setApiKeys(data);
        
        // Загружаем первый ключ в форму для редактирования
        const firstKey = data[0];
        setFormData({
          api_key: firstKey.api_key || '',
          api_secret: firstKey.api_secret || '',
          is_testnet: firstKey.is_testnet || false
        });
        
        console.log('🔑🔥 Loaded into form:', firstKey);
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

  const saveApiKeys = async () => {
    try {
      if (!user?.id) {
        throw new Error('Пользователь не авторизован');
      }

      if (!formData.api_key || !formData.api_secret) {
        throw new Error('Введите API ключ и секрет');
      }

      if (formData.api_key.includes('@') || formData.api_secret.includes('@')) {
        throw new Error('API ключи не должны содержать @. Это НЕ email!');
      }

      setLoading(true);
      console.log('🔑🔥 Saving API keys:', {
        user_id: user.id,
        api_key: formData.api_key.substring(0, 10) + '...',
        is_testnet: formData.is_testnet
      });

      const { data, error } = await supabase
        .from('api_keys_dev')
        .upsert({
          user_id: user.id,
          exchange: 'bybit',
          api_key: formData.api_key,
          api_secret: formData.api_secret,
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
        description: "Ключи Bybit успешно сохранены/обновлены",
      });

      // Перезагружаем ключи
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
      {/* Форма для API ключей */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            🔑 API Ключи Bybit
          </CardTitle>
          <CardDescription>
            {apiKeys.length > 0 ? 'Редактируйте существующие ключи' : 'Добавьте API ключи для торговли'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <input
              type="checkbox"
              id="testnet"
              checked={formData.is_testnet}
              onChange={(e) => setFormData(prev => ({ ...prev, is_testnet: e.target.checked }))}
            />
            <Label htmlFor="testnet">🧪 Тестовая сеть (Testnet)</Label>
          </div>

          <div>
            <Label htmlFor="api_key">🔑 API Ключ</Label>
            <Input
              id="api_key"
              type="text"
              value={formData.api_key}
              onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
              placeholder="Введите API ключ от Bybit"
              className="text-black bg-white border-gray-300 focus:text-black"
            />
          </div>

          <div>
            <Label htmlFor="api_secret">🔐 API Секрет</Label>
            <div className="flex gap-2">
              <Input
                id="api_secret"
                type={showSecret ? 'text' : 'password'}
                value={formData.api_secret}
                onChange={(e) => setFormData(prev => ({ ...prev, api_secret: e.target.value }))}
                placeholder="Введите API секрет от Bybit"
                className="text-black bg-white border-gray-300 focus:text-black"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <Button onClick={saveApiKeys} disabled={loading} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Сохранение...' : '💾 Сохранить/Обновить ключи'}
          </Button>
        </CardContent>
      </Card>

      {/* Статус сохраненных ключей */}
      <Card>
        <CardHeader>
          <CardTitle>📋 Статус API ключей</CardTitle>
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
              {apiKeys.map((apiKey, index) => (
                <div key={apiKey.id || index} className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800">
                        BYBIT
                      </Badge>
                      {apiKey.is_testnet && <Badge variant="secondary">Testnet</Badge>}
                      <Badge className="bg-green-100 text-green-800">✅ Активен</Badge>
                    </div>
                  </div>
                  
                  <div className="mt-2 text-sm text-black">
                    <div>🔑 API Ключ: <code className="bg-gray-200 px-2 py-1 rounded text-black">{apiKey.api_key?.substring(0, 10)}...</code></div>
                    <div>🔐 API Секрет: <code className="bg-gray-200 px-2 py-1 rounded text-black">{apiKey.api_secret?.substring(0, 10)}...</code></div>
                    <div>📅 Создан: {new Date(apiKey.created_at).toLocaleString('ru-RU')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-black">
              <strong>🔄 Отладка:</strong> Всего ключей в базе: <strong>{apiKeys.length}</strong>
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

export default ApiKeysWorking;