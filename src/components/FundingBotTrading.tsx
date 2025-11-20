import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  TrendingUp, 
  TrendingDown, 
  X, 
  BarChart3, 
  Square, 
  DollarSign,
  Eye,
  TestTube
} from 'lucide-react';

interface FundingBotTradingProps {
  user: any;
  selectedExchange: string;
}

const FundingBotTrading: React.FC<FundingBotTradingProps> = ({ user, selectedExchange }) => {
  console.log('🤖 FUNDING BOT TRADING: Component loaded with:', { user: user?.email, selectedExchange });
  
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<any>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // Проверка на валидность props
  if (!user) {
    console.warn('🤖 FUNDING BOT TRADING: No user provided, showing loading state');
    return (
      <Card className="trading-card">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <div className="text-muted-foreground">
              🔄 Загрузка данных пользователя...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!selectedExchange) {
    console.error('🤖 FUNDING BOT TRADING: No exchange selected');
    return (
      <Card className="trading-card">
        <CardContent className="p-6">
          <div className="text-center text-yellow-500">
            ⚠️ Выберите биржу для тестирования
          </div>
        </CardContent>
      </Card>
    );
  }

  // Функция вызова торгового API с настройками фандинг бота
  const callTradingAPI = async (action: string, orderType: string = 'LONG', forceExchange?: string) => {
    // 🚨 УСИЛЕННАЯ ЗАЩИТА ОТ МНОЖЕСТВЕННЫХ НАЖАТИЙ
    if (actionInProgress === action || loading) {
      console.log('🚨 PROTECTION: Action', action, 'blocked - actionInProgress:', actionInProgress, 'loading:', loading);
      return { success: false, error: 'Action already in progress', blocked: true };
    }
    
    // 🚨 ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА НА МНОЖЕСТВЕННЫЕ ВЫЗОВЫ
    if (action === 'place_order_with_tp_sl') {
      const now = Date.now();
      const lastOrderTime = localStorage.getItem('lastOrderTime');
      if (lastOrderTime && (now - parseInt(lastOrderTime)) < 3000) { // 3 секунды
        console.log('🚨 PROTECTION: Order blocked - too soon after last order');
        return { success: false, error: 'Please wait 3 seconds between orders', blocked: true };
      }
      localStorage.setItem('lastOrderTime', now.toString());
    }
    
    // 🚨 КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ БЕЗОПАСНОСТИ
    console.log('🚨 SECURITY: Trading API called:', action, 'by user action');
    console.trace('🚨 SECURITY: Call stack trace');
    
    try {
      setLoading(true);
      setActionInProgress(action);
      
      // Автоматический сброс блокировки через 15 секунд
      setTimeout(() => {
        setActionInProgress(null);
        setLoading(false);
        console.log('⚠️ AUTO-UNLOCK: Interface unlocked after timeout');
      }, 15000);
      
      if (!user?.id) {
        throw new Error('Пользователь не авторизован');
      }
      
      // Загружаем настройки фандинг бота
      console.log('🤖 FUNDING BOT: Загрузка настроек фандинг бота...');
      const { data: fundingSettings, error: fundingError } = await supabase
        .from('funding_bot_settings_2025_11_09_06_55')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (fundingError && fundingError.code !== 'PGRST116') {
        console.error('❌ Ошибка загрузки настроек фандинг бота:', fundingError);
        throw new Error('Не удалось загрузить настройки фандинг бота');
      }
      
      // Используем настройки фандинг бота или значения по умолчанию
      const settings = fundingSettings || {
        position_size_usd: 100,
        leverage: 10,
        take_profit_percent: 2.0,
        stop_loss_percent: 5.0
      };
      
      console.log('🤖 FUNDING BOT: Используем настройки:', settings);
      
      console.log('FUNDING BOT TRADING: Calling trading API:', { action, user_id: user.id, forceExchange, settings });
      
      // Используем принудительно заданную биржу или выбранную
      const currentExchange = forceExchange || selectedExchange || 'bybit';
      console.log('✅ FUNDING BOT TRADING: Используем биржу:', currentExchange);
      
      // Определяем функцию по бирже (та же логика что в TradingDashboard)
      let functionName;
      if (currentExchange === 'binance') {
        functionName = 'binance_long_short_fixed_v34_2025_11_09_20_30';
      } else if (currentExchange === 'gate') {
        functionName = 'gate_wider_margins_v24_2025_11_09_18_25';
      } else if (currentExchange === 'kucoin') {
        functionName = 'kucoin_leverage_fixed_v27_2025_11_09_19_20';
      } else if (currentExchange === 'okx') {
        functionName = 'okx_symbol_fixed_v27_2025_11_09_19_25';
      } else if (currentExchange === 'mexc') {
        functionName = 'mexc_signature_fixed_v32_2025_11_09_20_05';
      } else {
        functionName = 'bybit_positions_settlecoin_v58_2025_11_10_06_40';
      }
      
      console.log('🎯 FUNDING BOT TRADING: Using function:', functionName, 'for exchange:', currentExchange);
      
      // Прямой вызов функции с настройками фандинг бота
      const response = await supabase.functions.invoke(functionName, {
        body: {
          action,
          user_id: user.id,
          order_type: orderType,
          // Передаем настройки фандинг бота
          funding_bot_settings: settings
        }
      });
      
      console.log('FUNDING BOT TRADING: API Response:', response);
      
      if (response.error) {
        throw new Error(response.error.message || 'Ошибка API');
      }
      
      return response.data || { success: true };
      
    } catch (error: any) {
      console.error('❌ FUNDING BOT TRADING API Error:', error);
      throw error;
    } finally {
      setLoading(false);
      setActionInProgress(null);
    }
  };

  // Отмена всех ордеров
  const cancelAllOrders = async () => {
    try {
      const result = await callTradingAPI('cancel_orders', 'LONG');
      toast({
        title: "❌ Ордера отменены",
        description: `Все активные ордера на ${selectedExchange.toUpperCase()} отменены`,
      });
    } catch (error: any) {
      toast({
        title: "❌ Ошибка отмены ордеров",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Закрытие всех позиций
  const closeAllPositions = async () => {
    try {
      const result = await callTradingAPI('close_positions', 'LONG');
      
      const closedCount = result?.closed_positions || result?.data?.closed_positions || 0;
      toast({
        title: "🔴 Позиции закрыты",
        description: `Закрыто ${closedCount} позиций на ${selectedExchange.toUpperCase()}`,
      });
    } catch (error: any) {
      toast({
        title: "❌ Ошибка закрытия позиций",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Размещение тестового LONG ордера
  const placeTestLong = async () => {
    try {
      const result = await callTradingAPI('place_order_with_tp_sl', 'LONG');
      
      if (result.success) {
        toast({
          title: "✅ Тестовый LONG ордер размещен",
          description: `Ордер размещен на ${selectedExchange.toUpperCase()}`,
        });
      } else {
        throw new Error(result.error || 'Ошибка размещения ордера');
      }
    } catch (error: any) {
      toast({
        title: "❌ Ошибка размещения LONG ордера",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Размещение тестового SHORT ордера
  const placeTestShort = async () => {
    try {
      const result = await callTradingAPI('place_order_with_tp_sl', 'SHORT');
      
      if (result.success) {
        toast({
          title: "✅ Тестовый SHORT ордер размещен",
          description: `Ордер размещен на ${selectedExchange.toUpperCase()}`,
        });
      } else {
        throw new Error(result.error || 'Ошибка размещения ордера');
      }
    } catch (error: any) {
      toast({
        title: "❌ Ошибка размещения SHORT ордера",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="trading-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Торговые операции на {selectedExchange.toUpperCase()}
        </CardTitle>
        <CardDescription>
          Полный функционал торговли на выбранной бирже
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Тестовые ордера */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button 
            onClick={placeTestLong}
            disabled={loading}
            variant="default" 
            className="h-16 glow-primary"
          >
            <div className="text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-1" />
              <div className="text-sm">🟢 Тестовый LONG</div>
              <div className="text-xs opacity-75">{selectedExchange.toUpperCase()}</div>
            </div>
          </Button>
          
          <Button 
            onClick={placeTestShort}
            disabled={loading}
            variant="destructive" 
            className="h-16 glow-destructive"
          >
            <div className="text-center">
              <TrendingDown className="h-6 w-6 mx-auto mb-1" />
              <div className="text-sm">🔴 Тестовый SHORT</div>
              <div className="text-xs opacity-75">{selectedExchange.toUpperCase()}</div>
            </div>
          </Button>
        </div>

        {/* Кнопки управления ордерами и позициями */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button 
            onClick={cancelAllOrders} 
            disabled={loading} 
            variant="destructive" 
            className="glass-button bg-destructive/20 border-destructive/30 h-16 vision-animate"
          >
            <div className="text-center">
              <X className="h-6 w-6 mx-auto mb-1" />
              <div className="text-sm">❌ Отменить ордера</div>
              <div className="text-xs opacity-75">На {selectedExchange.toUpperCase()}</div>
            </div>
          </Button>
          
          <Button 
            onClick={closeAllPositions} 
            disabled={loading} 
            variant="destructive" 
            className="glass-button bg-red-500/20 border-red-500/30 h-16 vision-animate"
          >
            <div className="text-center">
              <Square className="h-6 w-6 mx-auto mb-1" />
              <div className="text-sm">🔴 Закрыть позиции</div>
              <div className="text-xs opacity-75">На {selectedExchange.toUpperCase()}</div>
            </div>
          </Button>
        </div>

        {/* Статус загрузки */}
        {loading && (
          <div className="text-center p-4 bg-blue-500/10 rounded-lg">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
            <div className="text-sm text-blue-600">Выполняется операция...</div>
          </div>
        )}

        {/* Информация о позициях */}
        {positions.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Активные позиции:</h4>
            {positions.map((position, index) => (
              <div key={index} className="p-3 bg-gray-100 rounded-lg text-sm">
                <div className="flex justify-between">
                  <span>{position.symbol}</span>
                  <Badge variant={position.side === 'Buy' ? 'default' : 'destructive'}>
                    {position.side}
                  </Badge>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Размер: {position.size} • PnL: {position.unrealisedPnl}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FundingBotTrading;