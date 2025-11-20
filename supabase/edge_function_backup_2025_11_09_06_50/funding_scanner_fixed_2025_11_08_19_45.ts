import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

const TELEGRAM_BOT_TOKEN = '8580424708:AAGH3b4O9JB4YCcW8HS25nIPubHpEkEabgs';
const TELEGRAM_CHAT_ID = '5498907359';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📡 FUNDING SCANNER STARTED');
    
    // Сканируем все биржи на фандинг > 0.5%
    const fundingResults = await scanAllExchangesFunding();
    
    // Отправляем результаты в Telegram (всегда)
    await sendFundingToTelegram(fundingResults);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Найдено ${fundingResults.length} возможностей фандинга`,
        funding_opportunities: fundingResults
      }),
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

async function scanAllExchangesFunding() {
  console.log('📡 Scanning funding rates from all exchanges...');
  
  const allOpportunities = [];

  try {
    // 1. Binance Futures
    console.log('📡 Scanning Binance...');
    const binanceResponse = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    
    if (binanceResponse.ok) {
      const binanceData = await binanceResponse.json();
      
      const binanceOpportunities = binanceData
        .filter((item: any) => parseFloat(item.lastFundingRate) > 0.005) // > 0.5%
        .map((item: any) => ({
          exchange: 'Binance',
          symbol: item.symbol,
          funding_rate: (parseFloat(item.lastFundingRate) * 100).toFixed(3),
          next_funding_time: new Date(parseInt(item.nextFundingTime)).toISOString(),
          link: `https://www.binance.com/ru/futures/${item.symbol.replace('USDT', '_USDT')}`
        }))
        .sort((a: any, b: any) => parseFloat(b.funding_rate) - parseFloat(a.funding_rate))
        .slice(0, 5); // Топ 5

      allOpportunities.push(...binanceOpportunities);
    }

    // 2. Bybit
    console.log('📡 Scanning Bybit...');
    const bybitResponse = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
    
    if (bybitResponse.ok) {
      const bybitData = await bybitResponse.json();
      
      if (bybitData.retCode === 0) {
        const bybitOpportunities = bybitData.result.list
          .filter((item: any) => parseFloat(item.fundingRate || '0') > 0.005) // > 0.5%
          .map((item: any) => ({
            exchange: 'Bybit',
            symbol: item.symbol,
            funding_rate: (parseFloat(item.fundingRate || '0') * 100).toFixed(3),
            next_funding_time: new Date(parseInt(item.nextFundingTime || '0')).toISOString(),
            link: `https://www.bybit.com/trade/usdt/${item.symbol}`
          }))
          .sort((a: any, b: any) => parseFloat(b.funding_rate) - parseFloat(a.funding_rate))
          .slice(0, 5); // Топ 5

        allOpportunities.push(...bybitOpportunities);
      }
    }

    // 3. Gate.io
    console.log('📡 Scanning Gate.io...');
    const gateResponse = await fetch('https://api.gateio.ws/api/v4/futures/usdt/tickers');
    
    if (gateResponse.ok) {
      const gateData = await gateResponse.json();
      
      const gateOpportunities = gateData
        .filter((item: any) => parseFloat(item.funding_rate || '0') > 0.005) // > 0.5%
        .map((item: any) => ({
          exchange: 'Gate',
          symbol: item.contract,
          funding_rate: (parseFloat(item.funding_rate || '0') * 100).toFixed(3),
          next_funding_time: new Date(parseInt(item.funding_time || '0') * 1000).toISOString(),
          link: `https://www.gate.io/trade/${item.contract}`
        }))
        .sort((a: any, b: any) => parseFloat(b.funding_rate) - parseFloat(a.funding_rate))
        .slice(0, 5); // Топ 5

      allOpportunities.push(...gateOpportunities);
    }

  } catch (error) {
    console.error('❌ Funding scan error:', error.message);
  }

  // Сортируем все возможности по убыванию фандинга
  return allOpportunities
    .sort((a: any, b: any) => parseFloat(b.funding_rate) - parseFloat(a.funding_rate))
    .slice(0, 10); // Топ 10 общих
}

async function sendFundingToTelegram(opportunities: any[]) {
  console.log('📱 Sending funding opportunities to Telegram...');
  
  const currentTime = new Date().toLocaleString('ru-RU', { 
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit'
  });

  let message;
  
  if (opportunities.length === 0) {
    // Сообщение когда нет возможностей
    message = `🔍 *СКАН ФАНДИНГА* (${currentTime})\n\n`;
    message += `🚨 Нет возможностей > 0.5%\n\n`;
    message += `📉 Просканировано: Binance, Bybit, Gate\n`;
    message += `⏰ Следующий скан через 10 минут`;
  } else {
    // Сообщение когда есть возможности
    message = `🚀 *ФАНДИНГ ВОЗМОЖНОСТИ* (${currentTime})\n\n`;
    message += `💰 Найдено ${opportunities.length} возможностей > 0.5%\n\n`;

    opportunities.forEach((opp: any, index: number) => {
      const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '💎';
      message += `${emoji} *${opp.exchange}* - ${opp.symbol}\n`;
      message += `📈 Фандинг: *${opp.funding_rate}%*\n`;
      message += `🔗 [Торговать](${opp.link})\n\n`;
    });

    message += `⏰ Следующее сканирование через 10 минут`;
  }

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });

    if (telegramResponse.ok) {
      console.log('✅ Telegram message sent successfully');
    } else {
      const errorText = await telegramResponse.text();
      console.error('❌ Telegram send error:', errorText);
    }
  } catch (error) {
    console.error('❌ Telegram error:', error.message);
  }
}