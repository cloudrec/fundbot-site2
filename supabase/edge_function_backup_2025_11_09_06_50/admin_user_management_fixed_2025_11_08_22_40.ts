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
    
    console.log('👑 ADMIN USER MANAGEMENT FIXED:', { action, admin_user_id, target_user_email, is_active });

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
        result = await getAllUsersFixed(supabase);
        break;
      
      case 'toggle_user_activation':
        result = await toggleUserActivationFixed(supabase, target_user_email, is_active);
        break;
      
      case 'get_user_stats':
        result = await getUserStatsFixed(supabase);
        break;
      
      default:
        throw new Error(`Неизвестное действие: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ ADMIN USER MANAGEMENT FIXED Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// 👥 ИСПРАВЛЕННОЕ ПОЛУЧЕНИЕ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ
async function getAllUsersFixed(supabase: any) {
  console.log('👥 Getting all users (FIXED)...');
  
  // Сначала проверяем какие таблицы с пользователями существуют
  console.log('🔍 Checking available user tables...');
  
  let subscriptions = [];
  let tableName = '';
  
  // Пробуем разные возможные таблицы
  const possibleTables = [
    'subscriptions',
    'user_subscriptions', 
    'user_subscriptions_dev',
    'users'
  ];
  
  for (const table of possibleTables) {
    try {
      console.log(`🔍 Trying table: ${table}`);
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
        
      if (!error && data) {
        console.log(`✅ Found table: ${table}`);
        tableName = table;
        break;
      }
    } catch (e) {
      console.log(`❌ Table ${table} not found or error:`, e.message);
    }
  }
  
  if (!tableName) {
    // Если нет таблиц подписок, создаем пользователей из других источников
    console.log('📊 No subscription tables found, getting users from other sources...');
    
    // Получаем пользователей из trading_settings
    const { data: tradingUsers, error: tradingError } = await supabase
      .from('trading_settings')
      .select('user_id, exchange, base_asset, quote_asset, order_amount_usd, created_at')
      .order('created_at', { ascending: false });
    
    if (!tradingError && tradingUsers) {
      console.log(`📊 Found ${tradingUsers.length} users in trading_settings`);
      
      // Преобразуем в формат подписок
      const uniqueUsers = new Map();
      
      for (const user of tradingUsers) {
        if (!uniqueUsers.has(user.user_id)) {
          uniqueUsers.set(user.user_id, {
            id: user.user_id,
            user_email: user.user_id, // Предполагаем что user_id это email
            user_id: user.user_id,
            status: 'active',
            created_at: user.created_at,
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // +1 год
            is_active: true, // По умолчанию активны
            trading_settings: {
              exchange: user.exchange,
              base_asset: user.base_asset,
              quote_asset: user.quote_asset,
              order_amount_usd: user.order_amount_usd
            }
          });
        }
      }
      
      subscriptions = Array.from(uniqueUsers.values());
    }
  } else {
    // Получаем пользователей из найденной таблицы
    console.log(`📊 Getting users from table: ${tableName}`);
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Ошибка получения пользователей из ${tableName}: ${error.message}`);
    }
    
    subscriptions = data || [];
  }
  
  console.log(`📊 Found ${subscriptions.length} users total`);

  // Получаем дополнительную информацию о пользователях
  const usersWithDetails = await Promise.all(
    subscriptions.map(async (sub: any) => {
      try {
        const userId = sub.user_id || sub.user_email || sub.email;
        
        // Получаем настройки торговли (если еще не получены)
        let tradingSettings = sub.trading_settings;
        if (!tradingSettings) {
          const { data: settings } = await supabase
            .from('trading_settings')
            .select('exchange, base_asset, quote_asset, order_amount_usd')
            .eq('user_id', userId)
            .single();
          tradingSettings = settings;
        }

        // Получаем API ключи
        const { data: apiKeys } = await supabase
          .from('api_keys')
          .select('exchange')
          .eq('user_id', userId);

        return {
          ...sub,
          user_email: sub.user_email || sub.email || userId,
          trading_settings: tradingSettings,
          api_keys_count: apiKeys?.length || 0,
          exchanges: apiKeys?.map((k: any) => k.exchange) || []
        };
      } catch (error) {
        console.log('Error getting user details:', error.message);
        return {
          ...sub,
          user_email: sub.user_email || sub.email || sub.user_id,
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
    inactive_users: usersWithDetails.filter(u => u.is_active === false).length,
    source_table: tableName || 'trading_settings'
  };
}

// 🔄 ИСПРАВЛЕННАЯ АКТИВАЦИЯ/ДЕАКТИВАЦИЯ ПОЛЬЗОВАТЕЛЯ
async function toggleUserActivationFixed(supabase: any, userEmail: string, isActive: boolean) {
  console.log('🔄 Toggling user activation (FIXED):', { userEmail, isActive });
  
  // Пробуем обновить в разных возможных таблицах
  const possibleTables = [
    'subscriptions',
    'user_subscriptions', 
    'user_subscriptions_dev'
  ];
  
  let updateSuccess = false;
  let updateResult = null;
  
  for (const table of possibleTables) {
    try {
      console.log(`🔄 Trying to update in table: ${table}`);
      
      const { data, error } = await supabase
        .from(table)
        .update({ 
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq('user_email', userEmail)
        .select();

      if (!error && data && data.length > 0) {
        console.log(`✅ Successfully updated in table: ${table}`);
        updateSuccess = true;
        updateResult = data[0];
        break;
      }
    } catch (e) {
      console.log(`❌ Failed to update in table ${table}:`, e.message);
    }
  }
  
  if (!updateSuccess) {
    // Если не удалось обновить в таблицах подписок, создаем запись
    console.log('📝 Creating new subscription record...');
    
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          user_email: userEmail,
          user_id: userEmail,
          status: isActive ? 'active' : 'inactive',
          is_active: isActive,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // +1 год
          updated_at: new Date().toISOString()
        })
        .select();
        
      if (error) throw error;
      
      updateResult = data[0];
      updateSuccess = true;
      console.log('✅ Created new subscription record');
      
    } catch (createError) {
      throw new Error(`Не удалось создать запись для пользователя ${userEmail}: ${createError.message}`);
    }
  }

  if (!updateSuccess) {
    throw new Error(`Пользователь ${userEmail} не найден и не удалось создать запись`);
  }

  console.log('✅ User activation updated:', updateResult);

  return {
    user_email: userEmail,
    is_active: isActive,
    status: isActive ? 'АКТИВИРОВАН' : 'ДЕАКТИВИРОВАН',
    updated_at: new Date().toISOString(),
    message: `Пользователь ${userEmail} ${isActive ? 'активирован' : 'деактивирован'}`
  };
}

// 📊 ИСПРАВЛЕННАЯ СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ
async function getUserStatsFixed(supabase: any) {
  console.log('📊 Getting user statistics (FIXED)...');
  
  // Получаем пользователей через исправленную функцию
  const usersData = await getAllUsersFixed(supabase);
  const subscriptions = usersData.users;

  const now = new Date();
  const activeSubscriptions = subscriptions.filter((sub: any) => {
    const expiresAt = new Date(sub.expires_at || now);
    return expiresAt > now && sub.is_active !== false;
  });

  const expiredSubscriptions = subscriptions.filter((sub: any) => {
    const expiresAt = new Date(sub.expires_at || now);
    return expiresAt <= now;
  });

  const deactivatedUsers = subscriptions.filter((sub: any) => sub.is_active === false);

  return {
    total_users: subscriptions.length,
    active_subscriptions: activeSubscriptions.length,
    expired_subscriptions: expiredSubscriptions.length,
    manually_deactivated: deactivatedUsers.length,
    source_table: usersData.source_table,
    stats: {
      total: subscriptions.length,
      active: activeSubscriptions.length,
      expired: expiredSubscriptions.length,
      deactivated: deactivatedUsers.length,
      percentage_active: subscriptions.length > 0 ? Math.round((activeSubscriptions.length / subscriptions.length) * 100) : 0
    }
  };
}