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
    console.log('🕐 Auto Funding Scanner started');
    
    // Получаем текущее время
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    
    console.log(`🕐 Current time: ${now.toISOString()}, minutes: ${minutes}, seconds: ${seconds}`);
    
    // Проверяем, нужно ли запускать сканирование
    // За 20 минут до конца часа (40-я минута) или за 10 минут до конца часа (50-я минута)
    const shouldScan = (minutes === 40 && seconds < 30) || (minutes === 50 && seconds < 30);
    
    if (!shouldScan) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Not time to scan yet',
        next_scan_times: ['XX:40:00', 'XX:50:00'],
        current_time: now.toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('🚀 Starting funding scan...');
    
    // Вызываем основной фандинг-сканер
    const scanResult = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/funding_scanner_2025_11_07_09_00`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'scan_funding' })
    });
    
    const scanData = await scanResult.json();
    
    console.log('📊 Scan completed:', scanData);
    
    // Отправляем результат
    return new Response(JSON.stringify({
      success: true,
      message: 'Auto funding scan completed',
      scan_time: now.toISOString(),
      scan_trigger: minutes === 40 ? '20_minutes_before' : '10_minutes_before',
      scan_result: scanData,
      next_scan_time: minutes === 40 ? 'XX:50:00' : 'XX+1:40:00'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('🚨 Auto funding scanner error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});