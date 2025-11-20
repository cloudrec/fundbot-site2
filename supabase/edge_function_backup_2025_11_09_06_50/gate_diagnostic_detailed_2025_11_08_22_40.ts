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
    
    console.log('🔍 GATE.IO DIAGNOSTIC START for user_id:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const diagnosticResults = {
      user_id: user_id,
      timestamp: new Date().toISOString(),
      steps: []
    };

    // STEP 1: Получаем информацию о пользователе
    console.log('🔍 STEP 1: Getting user info...');
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id);
    
    const step1 = {
      step: 1,
      description: 'Get user info by UUID',
      success: !userError,
      data: {
        user_found: !!userData.user,
        user_email: userData.user?.email || null,
        error: userError?.message || null
      }
    };
    diagnosticResults.steps.push(step1);
    console.log('🔍 STEP 1 RESULT:', step1);

    // STEP 2: Поиск API ключей по UUID
    console.log('🔍 STEP 2: Searching API keys by UUID...');
    const { data: keysByUUID, error: uuidError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'gate');

    const step2 = {
      step: 2,
      description: 'Search API keys by UUID',
      success: !uuidError && keysByUUID && keysByUUID.length > 0,
      data: {
        keys_found: keysByUUID?.length || 0,
        keys_data: keysByUUID || [],
        error: uuidError?.message || null,
        query: `SELECT * FROM api_keys WHERE user_id = '${user_id}' AND exchange = 'gate'`
      }
    };
    diagnosticResults.steps.push(step2);
    console.log('🔍 STEP 2 RESULT:', step2);

    // STEP 3: Поиск API ключей по email (если есть)
    if (userData.user?.email) {
      console.log('🔍 STEP 3: Searching API keys by email...');
      const { data: keysByEmail, error: emailError } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', userData.user.email)
        .eq('exchange', 'gate');

      const step3 = {
        step: 3,
        description: 'Search API keys by email',
        success: !emailError && keysByEmail && keysByEmail.length > 0,
        data: {
          keys_found: keysByEmail?.length || 0,
          keys_data: keysByEmail || [],
          error: emailError?.message || null,
          query: `SELECT * FROM api_keys WHERE user_id = '${userData.user.email}' AND exchange = 'gate'`
        }
      };
      diagnosticResults.steps.push(step3);
      console.log('🔍 STEP 3 RESULT:', step3);
    }

    // STEP 4: Получаем ВСЕ API ключи для этого пользователя
    console.log('🔍 STEP 4: Getting ALL API keys for user...');
    const { data: allKeysByUUID, error: allUUIDError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', user_id);

    const step4 = {
      step: 4,
      description: 'Get ALL API keys by UUID',
      success: !allUUIDError,
      data: {
        total_keys: allKeysByUUID?.length || 0,
        exchanges: allKeysByUUID?.map(k => k.exchange) || [],
        keys_data: allKeysByUUID || [],
        error: allUUIDError?.message || null
      }
    };
    diagnosticResults.steps.push(step4);
    console.log('🔍 STEP 4 RESULT:', step4);

    // STEP 5: Получаем ВСЕ API ключи по email (если есть)
    if (userData.user?.email) {
      console.log('🔍 STEP 5: Getting ALL API keys by email...');
      const { data: allKeysByEmail, error: allEmailError } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', userData.user.email);

      const step5 = {
        step: 5,
        description: 'Get ALL API keys by email',
        success: !allEmailError,
        data: {
          total_keys: allKeysByEmail?.length || 0,
          exchanges: allKeysByEmail?.map(k => k.exchange) || [],
          keys_data: allKeysByEmail || [],
          error: allEmailError?.message || null
        }
      };
      diagnosticResults.steps.push(step5);
      console.log('🔍 STEP 5 RESULT:', step5);
    }

    // STEP 6: Проверяем структуру таблицы api_keys
    console.log('🔍 STEP 6: Checking api_keys table structure...');
    const { data: tableStructure, error: structureError } = await supabase
      .from('api_keys')
      .select('*')
      .limit(1);

    const step6 = {
      step: 6,
      description: 'Check api_keys table structure',
      success: !structureError,
      data: {
        sample_record: tableStructure?.[0] || null,
        columns: tableStructure?.[0] ? Object.keys(tableStructure[0]) : [],
        error: structureError?.message || null
      }
    };
    diagnosticResults.steps.push(step6);
    console.log('🔍 STEP 6 RESULT:', step6);

    // ФИНАЛЬНЫЙ АНАЛИЗ
    const finalAnalysis = {
      uuid_keys_found: step2.success,
      email_keys_found: diagnosticResults.steps.find(s => s.step === 3)?.success || false,
      user_has_keys: step4.data.total_keys > 0 || (diagnosticResults.steps.find(s => s.step === 5)?.data.total_keys || 0) > 0,
      gate_keys_exist: step2.success || (diagnosticResults.steps.find(s => s.step === 3)?.success || false),
      recommendation: ''
    };

    if (finalAnalysis.gate_keys_exist) {
      finalAnalysis.recommendation = '✅ Gate.io ключи найдены! Проблема может быть в Edge Function.';
    } else if (finalAnalysis.user_has_keys) {
      finalAnalysis.recommendation = '⚠️ У пользователя есть API ключи, но не для Gate.io. Нужно добавить Gate.io ключи.';
    } else {
      finalAnalysis.recommendation = '❌ У пользователя нет API ключей. Нужно добавить ключи через интерфейс.';
    }

    diagnosticResults.final_analysis = finalAnalysis;

    console.log('🔍 DIAGNOSTIC COMPLETE:', diagnosticResults);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: diagnosticResults,
        summary: finalAnalysis.recommendation
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ DIAGNOSTIC Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});