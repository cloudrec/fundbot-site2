import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface BotLog {
  id: string;
  exchange: string;
  action: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  created_at: string;
}

const LogsViewer = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bot_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Ошибка загрузки логов:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [user]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'success': return 'bg-green-600';
      case 'warning': return 'bg-yellow-600';
      case 'error': return 'bg-red-600';
      default: return 'bg-blue-600';
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-white">📋 Логи системы</CardTitle>
          <Button onClick={loadLogs} disabled={loading} variant="outline">
            {loading ? '🔄' : '🔄'} Обновить
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              📝 Логи отсутствуют
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="bg-gray-700 p-3 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center space-x-2">
                    <Badge className={getLevelColor(log.level)}>
                      {log.level.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">{log.exchange}</Badge>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString('ru-RU')}
                  </span>
                </div>
                <div className="text-sm">
                  <div className="font-semibold text-white mb-1">{log.action}</div>
                  <div className="text-gray-300">{log.message}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LogsViewer;
