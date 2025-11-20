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
    const { user_id } = await req.json();
    
    console.log('🔍 DIRECT DB CHECK for user_id:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Получаем email
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData.user?.email;
    
    console.log('👤 User data:', { user_id, userEmail });

    // ПРЯМОЙ ЗАПРОС К БАЗЕ ДАННЫХ
    console.log('🔍 DIRECT QUERY: SELECT * FROM api_keys WHERE user_id = ?');
    
    // Запрос 1: По UUID
    const { data: directByUUID, error: directUUIDError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', user_id);

    console.log('📊 DIRECT BY UUID:', {
      query: `SELECT * FROM api_keys WHERE user_id = '${user_id}'`,
      found: directByUUID?.length || 0,
      error: directUUIDError?.message,
      data: directByUUID
    });

    // Запрос 2: По email
    let directByEmail = [];
    let directEmailError = null;
    
    if (userEmail) {
      const { data: emailResult, error: emailErr } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', userEmail);
      
      directByEmail = emailResult || [];
      directEmailError = emailErr;
      
      console.log('📊 DIRECT BY EMAIL:', {
        query: `SELECT * FROM api_keys WHERE user_id = '${userEmail}'`,
        found: directByEmail.length,
        error: directEmailError?.message,
        data: directByEmail
      });
    }

    // Запрос 3: ВСЕ записи в таблице (первые 10)
    const { data: allRecords, error: allError } = await supabase
      .from('api_keys')
      .select('*')
      .limit(10);

    console.log('📊 ALL RECORDS (first 10):', {
      total: allRecords?.length || 0,
      error: allError?.message,
      data: allRecords
    });

    // Запрос 4: Поиск по частичному совпадению user_id
    const { data: partialMatch, error: partialError } = await supabase
      .from('api_keys')
      .select('*')
      .ilike('user_id', `%${user_id.substring(0, 8)}%`);

    console.log('📊 PARTIAL MATCH:', {
      query: `SELECT * FROM api_keys WHERE user_id ILIKE '%${user_id.substring(0, 8)}%'`,
      found: partialMatch?.length || 0,
      data: partialMatch
    });

    const result = {
      user_id,
      userEmail,
      searches: {
        by_uuid: {
          found: directByUUID?.length || 0,
          data: directByUUID,
          error: directUUIDError?.message
        },
        by_email: {
          found: directByEmail.length,
          data: directByEmail,
          error: directEmailError?.message
        },
        all_records: {
          total: allRecords?.length || 0,
          data: allRecords,
          error: allError?.message
        },
        partial_match: {
          found: partialMatch?.length || 0,
          data: partialMatch,
          error: partialError?.message
        }
      },
      analysis: {
        problem_identified: (directByUUID?.length || 0) === 0 && directByEmail.length === 0,
        total_keys_in_db: allRecords?.length || 0,
        user_has_any_keys: (directByUUID?.length || 0) > 0 || directByEmail.length > 0
      }
    };

    console.log('🎯 DIRECT DB CHECK COMPLETE:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ DIRECT DB CHECK Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});