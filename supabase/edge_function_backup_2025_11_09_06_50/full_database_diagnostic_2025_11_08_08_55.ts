import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔍 FULL DATABASE DIAGNOSTIC started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('🔍 Supabase URL:', supabaseUrl);
    console.log('🔍 Service key available:', !!supabaseServiceKey);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    const { user_id } = requestBody;
    
    console.log('🔍 Diagnostic for user_id:', user_id);

    const diagnostic = {
      timestamp: new Date().toISOString(),
      user_id: user_id,
      supabase_url: supabaseUrl,
      service_key_length: supabaseServiceKey?.length || 0,
      checks: {}
    };

    // 1. Проверяем общее количество записей в user_api_keys
    console.log('🔍 Step 1: Checking total records in user_api_keys');
    try {
      const { data: totalCount, error: totalError } = await supabase
        .from('user_api_keys')
        .select('*', { count: 'exact', head: true });
      
      diagnostic.checks.total_records = {
        success: !totalError,
        count: totalCount?.length || 0,
        error: totalError?.message
      };
      console.log('🔍 Total records result:', diagnostic.checks.total_records);
    } catch (e) {
      diagnostic.checks.total_records = {
        success: false,
        error: e.message
      };
    }

    // 2. Проверяем все записи пользователя
    console.log('🔍 Step 2: Checking user records');
    try {
      const { data: userRecords, error: userError } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_id', user_id);
      
      diagnostic.checks.user_records = {
        success: !userError,
        count: userRecords?.length || 0,
        records: userRecords?.map(record => ({
          id: record.id,
          exchange: record.exchange,
          has_api_key: !!record.api_key,
          api_key_length: record.api_key?.length || 0,
          has_api_secret: !!record.api_secret,
          api_secret_length: record.api_secret?.length || 0,
          created_at: record.created_at
        })) || [],
        error: userError?.message
      };
      console.log('🔍 User records result:', diagnostic.checks.user_records);
    } catch (e) {
      diagnostic.checks.user_records = {
        success: false,
        error: e.message
      };
    }

    // 3. Проверяем конкретно Gate.io ключи
    console.log('🔍 Step 3: Checking Gate.io keys specifically');
    try {
      const { data: gateRecords, error: gateError } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_id', user_id)
        .eq('exchange', 'gate');
      
      diagnostic.checks.gate_records = {
        success: !gateError,
        count: gateRecords?.length || 0,
        records: gateRecords || [],
        error: gateError?.message
      };
      console.log('🔍 Gate records result:', diagnostic.checks.gate_records);
    } catch (e) {
      diagnostic.checks.gate_records = {
        success: false,
        error: e.message
      };
    }

    // 4. Проверяем настройки пользователя
    console.log('🔍 Step 4: Checking user settings');
    try {
      const { data: settings, error: settingsError } = await supabase
        .from('trading_settings')
        .select('*')
        .eq('user_id', user_id);
      
      diagnostic.checks.user_settings = {
        success: !settingsError,
        count: settings?.length || 0,
        settings: settings?.map(s => ({
          id: s.id,
          exchange: s.exchange,
          base_asset: s.base_asset,
          quote_asset: s.quote_asset
        })) || [],
        error: settingsError?.message
      };
      console.log('🔍 Settings result:', diagnostic.checks.user_settings);
    } catch (e) {
      diagnostic.checks.user_settings = {
        success: false,
        error: e.message
      };
    }

    // 5. Проверяем структуру таблицы
    console.log('🔍 Step 5: Checking table structure');
    try {
      const { data: structure, error: structureError } = await supabase
        .rpc('exec_sql', { 
          sql_query: `
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'user_api_keys' 
            ORDER BY ordinal_position
          `
        });
      
      diagnostic.checks.table_structure = {
        success: !structureError,
        columns: structure || [],
        error: structureError?.message
      };
      console.log('🔍 Structure result:', diagnostic.checks.table_structure);
    } catch (e) {
      diagnostic.checks.table_structure = {
        success: false,
        error: e.message
      };
    }

    // 6. Проверяем RLS политики
    console.log('🔍 Step 6: Checking RLS policies');
    try {
      const { data: policies, error: policiesError } = await supabase
        .rpc('exec_sql', { 
          sql_query: `
            SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
            FROM pg_policies 
            WHERE tablename = 'user_api_keys'
          `
        });
      
      diagnostic.checks.rls_policies = {
        success: !policiesError,
        policies: policies || [],
        error: policiesError?.message
      };
      console.log('🔍 RLS policies result:', diagnostic.checks.rls_policies);
    } catch (e) {
      diagnostic.checks.rls_policies = {
        success: false,
        error: e.message
      };
    }

    console.log('✅ Full diagnostic completed');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Full database diagnostic completed',
        diagnostic: diagnostic
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ DIAGNOSTIC Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});