import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Key, Shield, AlertTriangle } from 'lucide-react';

const GateApiSetupGuide: React.FC = () => {
  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Настройка Gate.io API ключей
        </CardTitle>
        <CardDescription>
          Пошаговая инструкция для подключения Gate.io к торговому боту
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Предупреждение */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Важно:</strong> API ключи дают доступ к вашему аккаунту. Никогда не делитесь ими с третьими лицами!
          </AlertDescription>
        </Alert>

        {/* Шаг 1 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50">1</Badge>
            <h3 className="text-lg font-semibold">Войдите в Gate.io</h3>
          </div>
          <p className="text-gray-600 ml-8">
            Перейдите на <a href="https://www.gate.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
              gate.io <ExternalLink className="h-3 w-3" />
            </a> и войдите в свой аккаунт
          </p>
        </div>

        {/* Шаг 2 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50">2</Badge>
            <h3 className="text-lg font-semibold">Откройте API Management</h3>
          </div>
          <p className="text-gray-600 ml-8">
            Наведите на профиль → API Management → Create API Key
          </p>
        </div>

        {/* Шаг 3 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50">3</Badge>
            <h3 className="text-lg font-semibold">Настройте права доступа</h3>
          </div>
          <div className="ml-8 space-y-2">
            <p className="text-gray-600">Обязательно включите следующие права:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" />
                <span className="text-sm">✅ Futures Trading</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" />
                <span className="text-sm">✅ Read Account Info</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" />
                <span className="text-sm">✅ Read Position</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" />
                <span className="text-sm">✅ Place Orders</span>
              </div>
            </div>
          </div>
        </div>

        {/* Шаг 4 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50">4</Badge>
            <h3 className="text-lg font-semibold">Скопируйте ключи</h3>
          </div>
          <div className="ml-8 space-y-2">
            <p className="text-gray-600">После создания API ключа скопируйте:</p>
            <div className="bg-gray-50 p-3 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <code className="bg-white px-2 py-1 rounded text-sm">API Key</code>
                <span className="text-sm text-gray-600">- публичный ключ</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-white px-2 py-1 rounded text-sm">Secret Key</code>
                <span className="text-sm text-gray-600">- секретный ключ</span>
              </div>
            </div>
          </div>
        </div>

        {/* Шаг 5 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50">5</Badge>
            <h3 className="text-lg font-semibold">Добавьте ключи в бот</h3>
          </div>
          <div className="ml-8 space-y-2">
            <p className="text-gray-600">В форме ниже добавьте:</p>
            <div className="bg-gray-50 p-3 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <code className="bg-white px-2 py-1 rounded text-sm">GATE_API_KEY</code>
                <span className="text-sm text-gray-600">= ваш API Key</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-white px-2 py-1 rounded text-sm">GATE_API_SECRET</code>
                <span className="text-sm text-gray-600">= ваш Secret Key</span>
              </div>
            </div>
          </div>
        </div>

        {/* Безопасность */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>Безопасность:</strong> Рекомендуем ограничить IP-адреса для API ключей и регулярно их обновлять.
          </AlertDescription>
        </Alert>

        {/* Готово */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-green-100 text-green-800">✅</Badge>
            <h3 className="font-semibold text-green-800">Готово!</h3>
          </div>
          <p className="text-green-700 text-sm">
            После добавления ключей Gate.io будет работать в полном режиме с реальными балансами и торговлей.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default GateApiSetupGuide;