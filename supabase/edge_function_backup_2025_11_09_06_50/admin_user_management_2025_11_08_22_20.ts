import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

const ADMIN_EMAIL = 'cloudkroter@gmail.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, admin_user_id, target_user_email, is_active } = await req.json();
    
    console.log('👑 ADMIN USER MANAGEMENT:', { action, admin_user_id, target_user_email, is_active });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Проверяем права администратора
    const { data: adminUser } = await supabase.auth.admin.getUserById(admin_user_id);
    
    if (!adminUser.user || adminUser.user.email !== ADMIN_EMAIL) {
      throw new Error('Недостаточно прав для выполнения операции');
    }

    console.log('👑 ADMIN VERIFIED:', adminUser.user.email);

    let result;

    switch (action) {
      case 'get_all_users':
        result = await getAllUsers(supabase);
        break;
      
      case 'toggle_user_activation':
        result = await toggleUserActivation(supabase, target_user_email, is_active);
        break;
      
      case 'get_user_stats':
        result = await getUserStats(supabase);
        break;
      
      default:
        throw new Error(`Неизвестное действие: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ ADMIN USER MANAGEMENT Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// 👥 ПОЛУЧЕНИЕ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ
async function getAllUsers(supabase: any) {
  console.log('👥 Getting all users...');
  
  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Ошибка получения пользователей: ${error.message}`);
  }

  // Получаем дополнительную информацию о пользователях
  const usersWithDetails = await Promise.all(
    subscriptions.map(async (sub: any) => {
      try {
        // Получаем настройки торговли
        const { data: tradingSettings } = await supabase
          .from('trading_settings')
          .select('exchange, base_asset, quote_asset, order_amount_usd')
          .eq('user_id', sub.user_email) // Используем email как user_id
          .single();

        // Получаем API ключи
        const { data: apiKeys } = await supabase
          .from('api_keys')
          .select('exchange')
          .eq('user_id', sub.user_email);

        return {
          ...sub,
          trading_settings: tradingSettings,
          api_keys_count: apiKeys?.length || 0,
          exchanges: apiKeys?.map((k: any) => k.exchange) || []
        };
      } catch (error) {
        return {
          ...sub,
          trading_settings: null,
          api_keys_count: 0,
          exchanges: []
        };
      }
    })
  );

  return {
    users: usersWithDetails,
    total_users: usersWithDetails.length,
    active_users: usersWithDetails.filter(u => u.is_active !== false).length,
    inactive_users: usersWithDetails.filter(u => u.is_active === false).length
  };
}

// 🔄 АКТИВАЦИЯ/ДЕАКТИВАЦИЯ ПОЛЬЗОВАТЕЛЯ
async function toggleUserActivation(supabase: any, userEmail: string, isActive: boolean) {
  console.log('🔄 Toggling user activation:', { userEmail, isActive });
  
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ 
      is_active: isActive,
      updated_at: new Date().toISOString()
    })
    .eq('user_email', userEmail)
    .select();

  if (error) {
    throw new Error(`Ошибка обновления статуса пользователя: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(`Пользователь ${userEmail} не найден`);
  }

  console.log('✅ User activation updated:', data[0]);

  return {
    user_email: userEmail,
    is_active: isActive,
    status: isActive ? 'АКТИВИРОВАН' : 'ДЕАКТИВИРОВАН',
    updated_at: new Date().toISOString(),
    message: `Пользователь ${userEmail} ${isActive ? 'активирован' : 'деактивирован'}`
  };
}

// 📊 СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ
async function getUserStats(supabase: any) {
  console.log('📊 Getting user statistics...');
  
  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select('*');

  if (error) {
    throw new Error(`Ошибка получения статистики: ${error.message}`);
  }

  const now = new Date();
  const activeSubscriptions = subscriptions.filter((sub: any) => {
    const expiresAt = new Date(sub.expires_at);
    return expiresAt > now && sub.is_active !== false;
  });

  const expiredSubscriptions = subscriptions.filter((sub: any) => {
    const expiresAt = new Date(sub.expires_at);
    return expiresAt <= now;
  });

  const deactivatedUsers = subscriptions.filter((sub: any) => sub.is_active === false);

  return {
    total_users: subscriptions.length,
    active_subscriptions: activeSubscriptions.length,
    expired_subscriptions: expiredSubscriptions.length,
    manually_deactivated: deactivatedUsers.length,
    stats: {
      total: subscriptions.length,
      active: activeSubscriptions.length,
      expired: expiredSubscriptions.length,
      deactivated: deactivatedUsers.length,
      percentage_active: subscriptions.length > 0 ? Math.round((activeSubscriptions.length / subscriptions.length) * 100) : 0
    }
  };
}