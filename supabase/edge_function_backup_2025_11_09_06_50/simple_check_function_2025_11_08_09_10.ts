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
    console.log('🔍 SIMPLE CHECK Function started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    const { user_id } = requestBody;
    
    console.log('🔍 Checking for user_id:', user_id);

    const result = {
      timestamp: new Date().toISOString(),
      user_id: user_id,
      checks: {}
    };

    // 1. Проверяем все записи в api_keys_dev
    console.log('🔍 Step 1: Checking all records in api_keys_dev');
    try {
      const { data: allRecords, error: allError } = await supabase
        .from('api_keys_dev')
        .select('*')
        .limit(5);
      
      result.checks.all_records = {
        success: !allError,
        count: allRecords?.length || 0,
        sample_records: allRecords?.map(record => {
          const keys = Object.keys(record);
          const sample = {};
          keys.forEach(key => {
            if (key.includes('secret') || key.includes('key')) {
              sample[key] = record[key] ? `${record[key].substring(0, 10)}...` : null;
            } else {
              sample[key] = record[key];
            }
          });
          return sample;
        }) || [],
        error: allError?.message
      };
      console.log('🔍 All records result:', result.checks.all_records);
    } catch (e) {
      result.checks.all_records = {
        success: false,
        error: e.message
      };
    }

    // 2. Проверяем записи конкретного пользователя
    console.log('🔍 Step 2: Checking user records in api_keys_dev');
    try {
      const { data: userRecords, error: userError } = await supabase
        .from('api_keys_dev')
        .select('*')
        .eq('user_id', user_id);
      
      result.checks.user_records = {
        success: !userError,
        count: userRecords?.length || 0,
        records: userRecords?.map(record => {
          const keys = Object.keys(record);
          const sample = {};
          keys.forEach(key => {
            if (key.includes('secret') || key.includes('key')) {
              sample[key] = record[key] ? `${record[key].substring(0, 10)}... (${record[key].length} chars)` : null;
            } else {
              sample[key] = record[key];
            }
          });
          return sample;
        }) || [],
        error: userError?.message
      };
      console.log('🔍 User records result:', result.checks.user_records);
    } catch (e) {
      result.checks.user_records = {
        success: false,
        error: e.message
      };
    }

    // 3. Проверяем структуру таблицы api_keys_dev
    console.log('🔍 Step 3: Checking table structure');
    try {
      const { data: structure, error: structureError } = await supabase
        .rpc('exec_sql', { 
          sql_query: `
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'api_keys_dev' 
            ORDER BY ordinal_position
          `
        });
      
      result.checks.table_structure = {
        success: !structureError,
        columns: structure || [],
        error: structureError?.message
      };
      console.log('🔍 Structure result:', result.checks.table_structure);
    } catch (e) {
      result.checks.table_structure = {
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
      
      result.checks.user_settings = {
        success: !settingsError,
        count: settings?.length || 0,
        settings: settings || [],
        error: settingsError?.message
      };
      console.log('🔍 Settings result:', result.checks.user_settings);
    } catch (e) {
      result.checks.user_settings = {
        success: false,
        error: e.message
      };
    }

    console.log('✅ Simple check completed');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Simple check completed',
        data: result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ SIMPLE CHECK Error:', error);
    
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