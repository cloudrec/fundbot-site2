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
    console.log('📊 FUNDING SCANNER: Starting scan');

    const { action } = await req.json();
    
    if (action === 'scan_funding') {
      const result = await scanAllExchangesFunding();
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Unknown action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ FUNDING SCANNER Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Сканирование фандинга по всем биржам
async function scanAllExchangesFunding() {
  console.log('📊 FUNDING SCANNER: Scanning all exchanges');
  
  const results = {
    binance: [],
    bybit: [],
    gate: [],
    timestamp: new Date().toISOString(),
    total_found: 0
  };

  try {
    // Сканируем Binance
    const binanceResults = await scanBinanceFunding();
    results.binance = binanceResults;

    // Сканируем Bybit
    const bybitResults = await scanBybitFunding();
    results.bybit = bybitResults;

    // Сканируем Gate.io
    const gateResults = await scanGateFunding();
    results.gate = gateResults;

    // Подсчитываем общее количество
    results.total_found = results.binance.length + results.bybit.length + results.gate.length;

    console.log('📊 FUNDING SCANNER: Total found:', results.total_found);

    // Отправляем в Telegram если есть результаты
    if (results.total_found > 0) {
      await sendToTelegram(results);
    }

    return {
      success: true,
      data: results
    };

  } catch (error) {
    console.error('❌ FUNDING SCANNER: Scan error:', error);
    return {
      success: false,
      error: error.message,
      data: results
    };
  }
}

// Сканирование Binance фандинга
async function scanBinanceFunding() {
  console.log('📊 FUNDING SCANNER: Scanning Binance');
  
  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Binance API error: ${data.msg || 'Unknown error'}`);
    }

    const highFunding = data
      .filter((item: any) => {
        const fundingRate = parseFloat(item.lastFundingRate) * 100;
        return Math.abs(fundingRate) >= 0.5; // >= 0.5%
      })
      .map((item: any) => ({
        symbol: item.symbol,
        funding_rate: (parseFloat(item.lastFundingRate) * 100).toFixed(3),
        next_funding_time: new Date(parseInt(item.nextFundingTime)).toISOString(),
        exchange: 'binance',
        url: `https://www.binance.com/en/futures/${item.symbol}`
      }))
      .sort((a: any, b: any) => Math.abs(parseFloat(b.funding_rate)) - Math.abs(parseFloat(a.funding_rate)))
      .slice(0, 10); // Топ 10

    console.log('📊 FUNDING SCANNER: Binance found:', highFunding.length);
    return highFunding;

  } catch (error) {
    console.error('❌ FUNDING SCANNER: Binance error:', error);
    return [];
  }
}

// Сканирование Bybit фандинга
async function scanBybitFunding() {
  console.log('📊 FUNDING SCANNER: Scanning Bybit');
  
  try {
    const response = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
    const data = await response.json();

    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'}`);
    }

    const highFunding = data.result.list
      .filter((item: any) => {
        const fundingRate = parseFloat(item.fundingRate || '0') * 100;
        return Math.abs(fundingRate) >= 0.5; // >= 0.5%
      })
      .map((item: any) => ({
        symbol: item.symbol,
        funding_rate: (parseFloat(item.fundingRate || '0') * 100).toFixed(3),
        next_funding_time: new Date(parseInt(item.nextFundingTime || '0')).toISOString(),
        exchange: 'bybit',
        url: `https://www.bybit.com/trade/usdt/${item.symbol}`
      }))
      .sort((a: any, b: any) => Math.abs(parseFloat(b.funding_rate)) - Math.abs(parseFloat(a.funding_rate)))
      .slice(0, 10); // Топ 10

    console.log('📊 FUNDING SCANNER: Bybit found:', highFunding.length);
    return highFunding;

  } catch (error) {
    console.error('❌ FUNDING SCANNER: Bybit error:', error);
    return [];
  }
}

// Сканирование Gate.io фандинга
async function scanGateFunding() {
  console.log('📊 FUNDING SCANNER: Scanning Gate.io');
  
  try {
    const response = await fetch('https://api.gateio.ws/api/v4/futures/usdt/tickers');
    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Gate.io API error: Invalid response');
    }

    const highFunding = data
      .filter((item: any) => {
        const fundingRate = parseFloat(item.funding_rate || '0') * 100;
        return Math.abs(fundingRate) >= 0.5; // >= 0.5%
      })
      .map((item: any) => ({
        symbol: item.contract,
        funding_rate: (parseFloat(item.funding_rate || '0') * 100).toFixed(3),
        next_funding_time: new Date(parseInt(item.funding_rate_indicative || '0') * 1000).toISOString(),
        exchange: 'gate',
        url: `https://www.gate.io/trade/${item.contract}`
      }))
      .sort((a: any, b: any) => Math.abs(parseFloat(b.funding_rate)) - Math.abs(parseFloat(a.funding_rate)))
      .slice(0, 10); // Топ 10

    console.log('📊 FUNDING SCANNER: Gate.io found:', highFunding.length);
    return highFunding;

  } catch (error) {
    console.error('❌ FUNDING SCANNER: Gate.io error:', error);
    return [];
  }
}

// Отправка результатов в Telegram
async function sendToTelegram(results: any) {
  console.log('📊 FUNDING SCANNER: Sending to Telegram');
  
  try {
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!telegramBotToken || !telegramChatId) {
      console.log('📊 FUNDING SCANNER: Telegram credentials not configured');
      return;
    }

    let message = `🔥 *ВЫСОКИЙ ФАНДИНГ НАЙДЕН!*\n\n`;
    message += `📊 Всего найдено: *${results.total_found}* пар\n`;
    message += `⏰ Время сканирования: ${new Date(results.timestamp).toLocaleString('ru-RU')}\n\n`;

    // Binance результаты
    if (results.binance.length > 0) {
      message += `🟡 *BINANCE* (${results.binance.length}):\n`;
      results.binance.forEach((item: any) => {
        const emoji = parseFloat(item.funding_rate) > 0 ? '📈' : '📉';
        message += `${emoji} [${item.symbol}](${item.url}) - *${item.funding_rate}%*\n`;
      });
      message += '\n';
    }

    // Bybit результаты
    if (results.bybit.length > 0) {
      message += `🔵 *BYBIT* (${results.bybit.length}):\n`;
      results.bybit.forEach((item: any) => {
        const emoji = parseFloat(item.funding_rate) > 0 ? '📈' : '📉';
        message += `${emoji} [${item.symbol}](${item.url}) - *${item.funding_rate}%*\n`;
      });
      message += '\n';
    }

    // Gate.io результаты
    if (results.gate.length > 0) {
      message += `🟢 *GATE.IO* (${results.gate.length}):\n`;
      results.gate.forEach((item: any) => {
        const emoji = parseFloat(item.funding_rate) > 0 ? '📈' : '📉';
        message += `${emoji} [${item.symbol}](${item.url}) - *${item.funding_rate}%*\n`;
      });
    }

    const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    
    const telegramResponse = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });

    const telegramData = await telegramResponse.json();
    
    if (telegramResponse.ok) {
      console.log('📊 FUNDING SCANNER: Telegram message sent successfully');
    } else {
      console.error('📊 FUNDING SCANNER: Telegram error:', telegramData);
    }

  } catch (error) {
    console.error('📊 FUNDING SCANNER: Telegram send error:', error);
  }
}