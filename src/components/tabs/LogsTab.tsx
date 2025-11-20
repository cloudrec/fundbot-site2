import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const LogsTab = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadLogs();
  }, [filter]);

  const loadLogs = async () => {
    setLoading(true);
    
    try {
      let query = supabase
        .from('arbitrage_logs_2025_11_12_04_45')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter !== 'all') {
        query = query.eq('level', filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setLogs(data || []);
    } catch (error: any) {
      console.error('Ошибка загрузки логов:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!confirm('Очистить все логи?')) return;

    try {
      const { error } = await supabase
        .from('arbitrage_logs_2025_11_12_04_45')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;

      setLogs([]);
    } catch (error: any) {
      console.error('Ошибка очистки логов:', error);
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'success':
        return <Badge className="bg-green-600">✅ Успех</Badge>;
      case 'error':
        return <Badge variant="destructive">❌ Ошибка</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-600">⚠️ Предупреждение</Badge>;
      case 'info':
        return <Badge variant="secondary">ℹ️ Информация</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            <span>📝 Логи операций</span>
            <div className="flex items-center space-x-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40 bg-gray-700 border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-700">
                  <SelectItem value="all">Все логи</SelectItem>
                  <SelectItem value="success">Успешные</SelectItem>
                  <SelectItem value="error">Ошибки</SelectItem>
                  <SelectItem value="warning">Предупреждения</SelectItem>
                  <SelectItem value="info">Информация</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={loadLogs} disabled={loading} variant="outline" size="sm">
                {loading ? '🔄' : '🔄'} Обновить
              </Button>
              <Button onClick={clearLogs} variant="destructive" size="sm">
                🗑️ Очистить
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-700 p-3 rounded text-center">
              <div className="text-xl font-bold text-blue-400">{logs.length}</div>
              <div className="text-xs text-gray-300">Всего записей</div>
            </div>
            <div className="bg-gray-700 p-3 rounded text-center">
              <div className="text-xl font-bold text-green-400">
                {logs.filter(log => log.level === 'success').length}
              </div>
              <div className="text-xs text-gray-300">Успешных</div>
            </div>
            <div className="bg-gray-700 p-3 rounded text-center">
              <div className="text-xl font-bold text-red-400">
                {logs.filter(log => log.level === 'error').length}
              </div>
              <div className="text-xs text-gray-300">Ошибок</div>
            </div>
            <div className="bg-gray-700 p-3 rounded text-center">
              <div className="text-xl font-bold text-yellow-400">
                {logs.filter(log => log.level === 'warning').length}
              </div>
              <div className="text-xs text-gray-300">Предупреждений</div>
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.length > 0 ? (
              logs.map((log, index) => (
                <div key={index} className="bg-gray-700 p-3 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {getLevelBadge(log.level)}
                      <span className="text-sm font-semibold text-white">{log.action}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(log.created_at).toLocaleString('ru-RU')}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-300 mb-2">
                    {log.message}
                  </div>

                  {log.data && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                        Подробности
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-800 rounded text-xs overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">📝</div>
                <h3 className="text-lg font-semibold text-white mb-2">Нет логов</h3>
                <p className="text-gray-400">
                  {filter === 'all' ? 'Логи операций появятся здесь' : `Нет логов с уровнем "${filter}"`}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LogsTab;
