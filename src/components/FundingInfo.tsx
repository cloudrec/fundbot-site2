import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, TrendingUp, Clock, Shield, Zap } from 'lucide-react';

const FundingInfo = () => {
  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Info className="h-5 w-5 mr-2" />
          🤖 Что такое Фандинг Арбитраж Бот?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-900/30 p-4 rounded-lg border border-blue-700">
          <h3 className="text-lg font-semibold text-blue-300 mb-2">
            💡 Простыми словами
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            <strong>Фандинг бот</strong> — это автоматизированная торговая стратегия, которая зарабатывает на 
            <strong> ставках финансирования</strong> (funding fee) на фьючерсных платформах. 
            Бот автоматически открывает позиции для получения платы за финансирование, 
            практически без риска долгосрочного удержания позиций.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-900/30 p-3 rounded-lg border border-green-700">
            <div className="flex items-center mb-2">
              <TrendingUp className="h-4 w-4 text-green-400 mr-2" />
              <h4 className="font-semibold text-green-300">Как работает</h4>
            </div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• Анализирует ставки фандинга на биржах</li>
              <li>• Открывает позиции (лонг или шорт) для получения платежей</li>
              <li>• Автоматически закрывает позиции</li>
              <li>• Работает 24/7 без вашего участия</li>
            </ul>
          </div>

          <div className="bg-purple-900/30 p-3 rounded-lg border border-purple-700">
            <div className="flex items-center mb-2">
              <Clock className="h-4 w-4 text-purple-400 mr-2" />
              <h4 className="font-semibold text-purple-300">Периодичность</h4>
            </div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• Фандинг начисляется каждые 8 часов</li>
              <li>• На некоторых биржах — каждый час</li>
              <li>• Бот работает непрерывно</li>
              <li>• Автоматический выбор лучших ставок</li>
            </ul>
          </div>
        </div>

        <div className="bg-yellow-900/30 p-4 rounded-lg border border-yellow-700">
          <div className="flex items-center mb-2">
            <Shield className="h-4 w-4 text-yellow-400 mr-2" />
            <h4 className="font-semibold text-yellow-300">Преимущества</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <Badge variant="outline" className="mb-1">Низкий риск</Badge>
              <p className="text-gray-300">Минимальное время удержания позиций</p>
            </div>
            <div>
              <Badge variant="outline" className="mb-1">Автоматизация</Badge>
              <p className="text-gray-300">Работает без вашего участия</p>
            </div>
            <div>
              <Badge variant="outline" className="mb-1">Стабильность</Badge>
              <p className="text-gray-300">Регулярный пассивный доход</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-700 p-3 rounded-lg">
          <div className="flex items-center mb-2">
            <Zap className="h-4 w-4 text-blue-400 mr-2" />
            <h4 className="font-semibold text-white">В нашей системе</h4>
          </div>
          <div className="text-xs text-gray-300 space-y-1">
            <p>✅ <strong>Включение автоторговли</strong> запускает Фандинг бот</p>
            <p>✅ <strong>Автоматическое сканирование</strong> бирж и выбор лучших ставок</p>
            <p>✅ <strong>Настраиваемые параметры</strong> и ограничения риска</p>
            <p>✅ <strong>Мультибиржевая поддержка</strong>: Bybit, Binance, Gate.io, KuCoin, OKX, MEXC</p>
          </div>
        </div>

        <div className="text-center">
          <Badge variant="default" className="bg-blue-600">
            💰 Автоматический заработок на фандинге без постоянного участия
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

export default FundingInfo;
