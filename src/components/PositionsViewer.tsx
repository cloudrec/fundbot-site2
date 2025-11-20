import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Position {
  id: string;
  exchange: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entry_price: number;
  current_price?: number;
  pnl_usd: number;
  status: string;
  opened_at: string;
}

const PositionsViewer = () => {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPositions = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('active_positions')
        .select('*')
        .eq('user_id', user.id)
        .order('opened_at', { ascending: false });

      if (error) throw error;
      setPositions(data || []);
    } catch (error) {
      console.error('Ошибка загрузки позиций:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPositions();
  }, [user]);

  const getSideColor = (side: string) => {
    return side === 'long' ? 'bg-green-600' : 'bg-red-600';
  };

  const getPnlColor = (pnl: number) => {
    return pnl >= 0 ? 'text-green-400' : 'text-red-400';
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white">📈 Активные позиции</CardTitle>
          <Button onClick={loadPositions} disabled={loading} variant="outline">
            {loading ? '🔄' : '🔄'} Обновить
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {positions.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              📊 Активных позиций нет
            </div>
          ) : (
            positions.map((position) => (
              <div key={position.id} className="bg-gray-700 p-4 rounded-lg">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">{position.exchange}</Badge>
                    <Badge className={getSideColor(position.side)}>
                      {position.side.toUpperCase()}
                    </Badge>
                    <span className="font-semibold text-white">{position.symbol}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(position.opened_at).toLocaleString('ru-RU')}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">Размер</div>
                    <div className="text-white font-semibold">{position.size}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Цена входа</div>
                    <div className="text-white">${position.entry_price}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Текущая цена</div>
                    <div className="text-white">${position.current_price || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">PnL</div>
                    <div className={`font-semibold ${getPnlColor(position.pnl_usd)}`}>
                      ${position.pnl_usd.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PositionsViewer;
