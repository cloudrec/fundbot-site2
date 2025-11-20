import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    console.log('🧪 GATE.IO PUBLIC API TEST: Starting...');

    // Тестируем разные публичные эндпоинты Gate.io
    const tests = [];

    // 1. Тест публичного API - получение информации о контрактах
    console.log('🧪 TEST 1: Public contracts info');
    try {
      const contractsResponse = await fetch('https://api.gateio.ws/api/v4/futures/usdt/contracts', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const contractsData = await contractsResponse.json();
      console.log('🧪 TEST 1 Result:', contractsResponse.status, contractsData);
      
      tests.push({
        name: 'Public Contracts API',
        url: 'https://api.gateio.ws/api/v4/futures/usdt/contracts',
        status: contractsResponse.status,
        success: contractsResponse.status === 200,
        data: contractsResponse.status === 200 ? 'OK' : contractsData
      });
    } catch (error) {
      tests.push({
        name: 'Public Contracts API',
        url: 'https://api.gateio.ws/api/v4/futures/usdt/contracts',
        success: false,
        error: error.message
      });
    }

    // 2. Тест публичного API - получение тикеров
    console.log('🧪 TEST 2: Public tickers');
    try {
      const tickersResponse = await fetch('https://api.gateio.ws/api/v4/futures/usdt/tickers', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const tickersData = await tickersResponse.json();
      console.log('🧪 TEST 2 Result:', tickersResponse.status, 'Data length:', Array.isArray(tickersData) ? tickersData.length : 'Not array');
      
      tests.push({
        name: 'Public Tickers API',
        url: 'https://api.gateio.ws/api/v4/futures/usdt/tickers',
        status: tickersResponse.status,
        success: tickersResponse.status === 200,
        data: tickersResponse.status === 200 ? `${Array.isArray(tickersData) ? tickersData.length : 0} tickers` : tickersData
      });
    } catch (error) {
      tests.push({
        name: 'Public Tickers API',
        url: 'https://api.gateio.ws/api/v4/futures/usdt/tickers',
        success: false,
        error: error.message
      });
    }

    // 3. Тест приватного эндпоинта БЕЗ подписи (должен вернуть 401)
    console.log('🧪 TEST 3: Private API without signature (should fail)');
    try {
      const privateResponse = await fetch('https://api.gateio.ws/api/v4/futures/usdt/accounts', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const privateData = await privateResponse.json();
      console.log('🧪 TEST 3 Result:', privateResponse.status, privateData);
      
      tests.push({
        name: 'Private API (no auth)',
        url: 'https://api.gateio.ws/api/v4/futures/usdt/accounts',
        status: privateResponse.status,
        success: privateResponse.status === 401, // Ожидаем 401
        data: privateData,
        note: 'Should return 401 Unauthorized'
      });
    } catch (error) {
      tests.push({
        name: 'Private API (no auth)',
        url: 'https://api.gateio.ws/api/v4/futures/usdt/accounts',
        success: false,
        error: error.message
      });
    }

    // 4. Проверка доступности основного домена
    console.log('🧪 TEST 4: Main domain connectivity');
    try {
      const domainResponse = await fetch('https://api.gateio.ws', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('🧪 TEST 4 Result:', domainResponse.status);
      
      tests.push({
        name: 'Domain Connectivity',
        url: 'https://api.gateio.ws',
        status: domainResponse.status,
        success: domainResponse.status < 500, // Любой ответ кроме 5xx
        note: 'Basic connectivity test'
      });
    } catch (error) {
      tests.push({
        name: 'Domain Connectivity',
        url: 'https://api.gateio.ws',
        success: false,
        error: error.message
      });
    }

    console.log('🧪 GATE.IO PUBLIC API TEST: All tests completed');

    const summary = {
      total_tests: tests.length,
      successful: tests.filter(t => t.success).length,
      failed: tests.filter(t => !t.success).length
    };

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Gate.io API connectivity tests completed',
        summary: summary,
        tests: tests,
        analysis: {
          api_accessible: tests.filter(t => t.name.includes('Public')).every(t => t.success),
          private_endpoint_behavior: tests.find(t => t.name === 'Private API (no auth)')?.status === 401 ? 'Normal' : 'Unexpected',
          overall_status: summary.successful >= 3 ? 'Good' : 'Issues detected'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ GATE.IO PUBLIC API TEST Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});