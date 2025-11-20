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
    console.log('🔍 DIAGNOSTIC FUNCTION - CHECKING SETTINGS AND API KEYS');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    const { user_id } = requestBody;
    
    if (!user_id) {
      throw new Error('user_id is required');
    }

    // 1. Получаем настройки пользователя
    const { data: settings, error: settingsError } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    console.log('🔍 DIAGNOSTIC: Settings query result:', { settings, settingsError });

    // 2. Получаем ВСЕ API ключи пользователя
    const { data: allApiKeys, error: allApiError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id);

    console.log('🔍 DIAGNOSTIC: All API keys query result:', { allApiKeys, allApiError });

    // 3. Получаем API ключи для выбранной биржи
    let selectedExchangeKeys = null;
    let selectedExchangeError = null;
    
    if (settings && settings.exchange) {
      const { data: exchangeKeys, error: exchangeError } = await supabase
        .from('api_keys_dev')
        .select('*')
        .eq('user_id', user_id)
        .eq('exchange', settings.exchange)
        .eq('is_active', true);

      selectedExchangeKeys = exchangeKeys;
      selectedExchangeError = exchangeError;
      
      console.log('🔍 DIAGNOSTIC: Selected exchange keys query result:', { 
        exchange: settings.exchange, 
        exchangeKeys, 
        exchangeError 
      });
    }

    // 4. Получаем API ключи для Bybit
    const { data: bybitKeys, error: bybitError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'bybit')
      .eq('is_active', true);

    console.log('🔍 DIAGNOSTIC: Bybit keys query result:', { bybitKeys, bybitError });

    // 5. Получаем API ключи для Binance
    const { data: binanceKeys, error: binanceError } = await supabase
      .from('api_keys_dev')
      .select('*')
      .eq('user_id', user_id)
      .eq('exchange', 'binance')
      .eq('is_active', true);

    console.log('🔍 DIAGNOSTIC: Binance keys query result:', { binanceKeys, binanceError });

    // Формируем диагностический отчет
    const diagnosticReport = {
      user_id: user_id,
      settings: {
        found: !!settings,
        error: settingsError?.message || null,
        exchange: settings?.exchange || null,
        base_asset: settings?.base_asset || null,
        quote_asset: settings?.quote_asset || null
      },
      all_api_keys: {
        found: allApiKeys?.length || 0,
        error: allApiError?.message || null,
        exchanges: allApiKeys?.map(key => ({
          exchange: key.exchange,
          is_active: key.is_active,
          created_at: key.created_at
        })) || []
      },
      selected_exchange_keys: {
        exchange: settings?.exchange || null,
        found: selectedExchangeKeys?.length || 0,
        error: selectedExchangeError?.message || null,
        keys: selectedExchangeKeys?.map(key => ({
          exchange: key.exchange,
          is_active: key.is_active,
          has_api_key: !!key.api_key,
          has_api_secret: !!key.api_secret,
          created_at: key.created_at
        })) || []
      },
      bybit_keys: {
        found: bybitKeys?.length || 0,
        error: bybitError?.message || null,
        keys: bybitKeys?.map(key => ({
          exchange: key.exchange,
          is_active: key.is_active,
          has_api_key: !!key.api_key,
          has_api_secret: !!key.api_secret,
          created_at: key.created_at
        })) || []
      },
      binance_keys: {
        found: binanceKeys?.length || 0,
        error: binanceError?.message || null,
        keys: binanceKeys?.map(key => ({
          exchange: key.exchange,
          is_active: key.is_active,
          has_api_key: !!key.api_key,
          has_api_secret: !!key.api_secret,
          created_at: key.created_at
        })) || []
      },
      analysis: {
        settings_exchange: settings?.exchange || 'NOT_FOUND',
        has_settings: !!settings,
        has_selected_exchange_keys: (selectedExchangeKeys?.length || 0) > 0,
        has_bybit_keys: (bybitKeys?.length || 0) > 0,
        has_binance_keys: (binanceKeys?.length || 0) > 0,
        potential_issue: null
      }
    };

    // Анализируем потенциальные проблемы
    if (!settings) {
      diagnosticReport.analysis.potential_issue = 'NO_SETTINGS_FOUND';
    } else if (!selectedExchangeKeys || selectedExchangeKeys.length === 0) {
      diagnosticReport.analysis.potential_issue = `NO_API_KEYS_FOR_${settings.exchange.toUpperCase()}`;
    } else if (settings.exchange === 'binance' && binanceKeys.length === 0) {
      diagnosticReport.analysis.potential_issue = 'NO_BINANCE_API_KEYS';
    } else if (settings.exchange === 'bybit' && bybitKeys.length === 0) {
      diagnosticReport.analysis.potential_issue = 'NO_BYBIT_API_KEYS';
    } else {
      diagnosticReport.analysis.potential_issue = 'CONFIGURATION_LOOKS_CORRECT';
    }

    console.log('🔍 DIAGNOSTIC: Final report:', JSON.stringify(diagnosticReport, null, 2));

    return new Response(
      JSON.stringify({ 
        success: true, 
        diagnostic_report: diagnosticReport,
        message: 'Диагностика завершена. Проверьте diagnostic_report для деталей.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ DIAGNOSTIC Error:', error.message);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        diagnostic_failed: true
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});