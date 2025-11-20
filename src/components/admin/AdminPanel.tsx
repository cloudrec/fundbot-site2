import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Shield, CreditCard, Users, Settings, RefreshCw, UserPlus, Plus, Trash2, Edit, Pause, Play, UserX } from 'lucide-react';
import DebugPanel from '@/components/DebugPanel'; // Импортируем DebugPanel

export default function AdminPanel() {
  const [tariffs, setTariffs] = useState([]);
  const [providers, setProviders] = useState([]);
  const [managedUsers, setManagedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editProvider, setEditProvider] = useState(null);

  const [tariffForm, setTariffForm] = useState({
    name: '',
    type: 'standard',
    description: '',
    price: 0,
    currency: 'USDT',
    duration_days: 30,
    percentage_rate: 0,
    is_active: true
  });

  const [userForm, setUserForm] = useState({
    email: '',
    status: 'active',
    notes: ''
  });

  const [adminForm, setAdminForm] = useState({
    email: '',
    role: 'admin'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    loadTariffs();
    loadProviders();
    loadUsers();
  };

  const loadTariffs = async () => {
    try {
      const { data, error } = await supabase
        .from('tariff_plans_2025_11_16_13_50')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Ошибка загрузки тарифов:', error);
        toast({ title: 'Ошибка загрузки тарифов', variant: 'destructive' });
        return;
      }
      
      setTariffs(data || []);
    } catch (error) {
      console.error('Ошибка:', error);
    }
  };

  const loadProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_provider_settings_2025_11_16_13_50')
        .select('*')
        .order('priority');
      
      if (error) {
        console.error('Ошибка загрузки провайдеров:', error);
        return;
      }
      
      setProviders(data || []);
    } catch (error) {
      console.error('Ошибка:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_management_2025_11_16_13_50')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Ошибка загрузки пользователей:', error);
        return;
      }
      
      setManagedUsers(data || []);
    } catch (error) {
      console.error('Ошибка:', error);
    }
  };

  const createTariff = async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('tariff_plans_2025_11_16_13_50')
        .insert([tariffForm]);
      
      if (error) throw error;
      
      toast({ title: 'Тариф создан успешно!' });
      setTariffForm({
        name: '',
        type: 'standard',
        description: '',
        price: 0,
        currency: 'USDT',
        duration_days: 30,
        percentage_rate: 0,
        is_active: true
      });
      loadTariffs();
    } catch (error) {
      toast({ title: 'Ошибка создания тарифа', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const deleteTariff = async (id) => {
    if (!confirm('Удалить тариф?')) return;
    try {
      const { error } = await supabase
        .from('tariff_plans_2025_11_16_13_50')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast({ title: 'Тариф удален' });
      loadTariffs();
    } catch (error) {
      toast({ title: 'Ошибка удаления', variant: 'destructive' });
    }
  };

  const addUser = async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('user_management_2025_11_16_13_50')
        .insert([{
          ...userForm,
          user_id: 'manual_' + Date.now()
        }]);
      
      if (error) throw error;
      
      toast({ title: 'Пользователь добавлен!' });
      setUserForm({ email: '', status: 'active', notes: '' });
      loadUsers();
    } catch (error) {
      toast({ title: 'Ошибка добавления пользователя', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateUserStatus = async (userId, status) => {
    try {
      const { error } = await supabase
        .from('user_management_2025_11_16_13_50')
        .update({ status })
        .eq('id', userId);
      
      if (error) throw error;
      toast({ title: 'Статус пользователя обновлен' });
      loadUsers();
    } catch (error) {
      toast({ title: 'Ошибка обновления статуса', variant: 'destructive' });
    }
  };

  const deleteUser = async (userId) => {
    if (!confirm('Удалить пользователя?')) return;
    try {
      const { error } = await supabase
        .from('user_management_2025_11_16_13_50')
        .delete()
        .eq('id', userId);
      
      if (error) throw error;
      toast({ title: 'Пользователь удален' });
      loadUsers();
    } catch (error) {
      toast({ title: 'Ошибка удаления', variant: 'destructive' });
    }
  };

  const makeAdmin = async () => {
    try {
      const { data, error } = await supabase.rpc('make_user_admin', {
        user_email: adminForm.email,
        admin_role: adminForm.role
      });
      
      if (error) throw error;
      toast({ title: 'Администратор назначен', description: data });
      setAdminForm({ email: '', role: 'admin' });
    } catch (error) {
      toast({ title: 'Ошибка назначения админа', variant: 'destructive' });
    }
  };

  const updateProvider = async (id, updates) => {
    try {
      const { error } = await supabase
        .from('payment_provider_settings_2025_11_16_13_50')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
      toast({ title: 'Провайдер обновлен' });
      loadProviders();
      setEditProvider(null);
    } catch (error) {
      toast({ title: 'Ошибка обновления провайдера', variant: 'destructive' });
    }
  };

  const renderTariffPrice = (tariff) => {
    if (tariff.type === 'pnl_percentage') {
      return tariff.percentage_rate + '% от прибыли';
    }
    return tariff.price + ' ' + tariff.currency + ' / ' + tariff.duration_days + ' дней';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <Shield className="h-8 w-8 text-blue-600" />
        <h1 className="text-4xl font-bold">Панель администратора</h1>
        <Button onClick={loadData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Обновить данные
        </Button>
      </div>

      {/* Добавляем Debug Panel */}
      <DebugPanel />

      <Tabs defaultValue="tariffs" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="tariffs">
            <CreditCard className="mr-2 h-4 w-4" />
            Тарифы ({tariffs.length})
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Пользователи ({managedUsers.length})
          </TabsTrigger>
          <TabsTrigger value="admins">
            <Shield className="mr-2 h-4 w-4" />
            Администраторы
          </TabsTrigger>
          <TabsTrigger value="payments">
            <Settings className="mr-2 h-4 w-4" />
            Платежи ({providers.length})
          </TabsTrigger>
        </TabsList>

        {/* Ваши остальные компоненты */}
      </Tabs>
    </div>
  );
}
