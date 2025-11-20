import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, X } from 'lucide-react';

interface Position {
  id: string;
  exchange: string;
  symbol: string;
  side: string;
  size: number;
  entry_price: number;
  leverage: number;
  unrealized_pnl: number;
  funding_received: number;
  status: string;
  opened_at: string;
}

const PositionsTab = () => {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPositions();
    const interval = setInterval(loadPositions, 30000); // Обновляем каждые 30 секунд
    return () => clearInterval(interval);
  }, []);

  const loadPositions = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('funding_arbitrage_bot_2025_11_12_05_20', {
        body: { action: 'get_funding_positions' }
      });

      if (error) throw error;
      
      if (data.success) {
        setPositions(data.positions || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки позиций:', error);
    }
  };

  const closePosition = async (positionId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('funding_arbitrage_bot_2025_11_12_05_20', {
        body: { action: 'close_position', position_id: positionId }
      });

      if (error) throw error;

      toast({
        title: "✅ Позиция закрыта",
        description: "Позиция успешно закрыта",
      });

      await loadPositions();
    } catch (error: any) {
      toast({
        title: "Ошибка закрытия",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">📈 Активные Позиции</CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length > 0 ? (
            <div className="space-y-4">
              {positions.map((position) => (
                <div key={position.id} className="p-4 bg-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <Badge className="bg-purple-600">{position.exchange.toUpperCase()}</Badge>
                      <span className="text-white font-semibold">{position.symbol}</span>
                      <Badge variant={position.side === 'short' ? 'destructive' : 'default'}>
                        {position.side === 'short' ? (
                          <>
                            <TrendingDown className="h-3 w-3 mr-1" />
                            SHORT
                          </>
                        ) : (
                          <>
                            <TrendingUp className="h-3 w-3 mr-1" />
                            LONG
                          </>
                        )}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className={`text-lg font-bold ${position.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {position.unrealized_pnl >= 0 ? '+' : ''}${position.unrealized_pnl.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-400">PnL</div>
                      </div>
                      
                      <Button
                        onClick={() => closePosition(position.id)}
                        disabled={loading}
                        size="sm"
                        variant="destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Размер:</span>
                      <div className="text-white font-mono">{position.size.toFixed(4)}</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Цена входа:</span>
                      <div className="text-white font-mono">${position.entry_price.toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Плечо:</span>
                      <div className="text-white font-mono">{position.leverage}x</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Фандинг получен:</span>
                      <div className="text-green-400 font-mono">+${position.funding_received.toFixed(4)}</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Открыта:</span>
                      <div className="text-white font-mono text-xs">
                        {new Date(position.opened_at).toLocaleString('ru-RU')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400">Нет активных позиций</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PositionsTab;
