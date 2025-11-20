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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestBody = await req.json();
    const { action } = requestBody;
    
    console.log('💰 Funding scanner request:', { action });

    let result;
    
    switch (action) {
      case 'scan_funding':
        result = await scanAllExchangesFunding();
        break;
      case 'get_funding_history':
        result = await getFundingHistory();
        break;
      default:
        throw new Error(`❌ Неизвестное действие: ${action}`);
    }

    console.log('💰 Funding scanner result:', result);

    return new Response(JSON.stringify({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💰 Funding scanner error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Сканирование фандинга на всех биржах
async function scanAllExchangesFunding() {
  console.log('💰 Starting funding scan across all exchanges...');
  
  const results = [];
  const highFundingThreshold = 0.5; // 0.5% порог для уведомлений
  
  try {
    // Сканируем Bybit
    const bybitFunding = await scanBybitFunding();
    results.push(...bybitFunding);
    
    // Сканируем Binance
    const binanceFunding = await scanBinanceFunding();
    results.push(...binanceFunding);
    
    // Сканируем OKX
    const okxFunding = await scanOKXFunding();
    results.push(...okxFunding);
    
    // Фильтруем высокие ставки
    const highFundingRates = results.filter(item => 
      Math.abs(parseFloat(item.funding_rate)) >= highFundingThreshold
    );
    
    console.log(`💰 Found ${highFundingRates.length} high funding rates (>=${highFundingThreshold}%)`);
    
    // Отправляем уведомления в Telegram если есть высокие ставки
    if (highFundingRates.length > 0) {
      await sendTelegramNotification(highFundingRates, highFundingThreshold);
    }
    
    return {
      total_scanned: results.length,
      high_funding_count: highFundingRates.length,
      threshold: highFundingThreshold,
      high_funding_rates: highFundingRates.slice(0, 10), // Топ 10
      all_rates: results.slice(0, 50), // Топ 50 всех ставок
      scan_time: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('💰 Funding scan error:', error);
    throw error;
  }
}

// Сканирование Bybit
async function scanBybitFunding() {
  try {
    console.log('💰 Scanning Bybit funding rates...');
    
    const response = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg}`);
    }
    
    const fundingRates = data.result?.list?.map((ticker: any) => ({
      exchange: 'BYBIT',
      symbol: ticker.symbol,
      funding_rate: (parseFloat(ticker.fundingRate || '0') * 100).toFixed(4), // Конвертируем в проценты
      next_funding_time: ticker.nextFundingTime,
      price: ticker.lastPrice,
      volume_24h: ticker.volume24h,
      change_24h: ticker.price24hPcnt
    })).filter((item: any) => parseFloat(item.funding_rate) !== 0) || [];
    
    console.log(`💰 Bybit: Found ${fundingRates.length} funding rates`);
    return fundingRates;
    
  } catch (error) {
    console.error('💰 Bybit funding scan error:', error);
    return [];
  }
}

// Сканирование Binance
async function scanBinanceFunding() {
  try {
    console.log('💰 Scanning Binance funding rates...');
    
    // Получаем список символов
    const symbolsResponse = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const symbolsData = await symbolsResponse.json();
    
    if (!symbolsData.symbols) {
      throw new Error('Failed to get Binance symbols');
    }
    
    // Получаем фандинговые ставки
    const fundingResponse = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    const fundingData = await fundingResponse.json();
    
    const fundingRates = fundingData.map((item: any) => ({
      exchange: 'BINANCE',
      symbol: item.symbol,
      funding_rate: (parseFloat(item.lastFundingRate || '0') * 100).toFixed(4), // Конвертируем в проценты
      next_funding_time: item.nextFundingTime,
      price: item.markPrice,
      volume_24h: '0', // Binance не предоставляет в этом API
      change_24h: '0'
    })).filter((item: any) => parseFloat(item.funding_rate) !== 0);
    
    console.log(`💰 Binance: Found ${fundingRates.length} funding rates`);
    return fundingRates;
    
  } catch (error) {
    console.error('💰 Binance funding scan error:', error);
    return [];
  }
}

// Сканирование OKX
async function scanOKXFunding() {
  try {
    console.log('💰 Scanning OKX funding rates...');
    
    const response = await fetch('https://www.okx.com/api/v5/public/funding-rate?instType=SWAP', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.code !== '0') {
      throw new Error(`OKX API Error: ${data.msg}`);
    }
    
    const fundingRates = data.data?.map((item: any) => ({
      exchange: 'OKX',
      symbol: item.instId,
      funding_rate: (parseFloat(item.fundingRate || '0') * 100).toFixed(4), // Конвертируем в проценты
      next_funding_time: item.nextFundingTime,
      price: '0', // OKX не предоставляет цену в этом API
      volume_24h: '0',
      change_24h: '0'
    })).filter((item: any) => parseFloat(item.funding_rate) !== 0) || [];
    
    console.log(`💰 OKX: Found ${fundingRates.length} funding rates`);
    return fundingRates;
    
  } catch (error) {
    console.error('💰 OKX funding scan error:', error);
    return [];
  }
}

// Отправка уведомления в Telegram
async function sendTelegramNotification(highFundingRates: any[], threshold: number) {
  try {
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');
    
    if (!telegramBotToken || !telegramChatId) {
      console.log('💰 Telegram credentials not configured, skipping notification');
      return;
    }
    
    // Сортируем по убыванию абсолютного значения фандинга
    const sortedRates = highFundingRates
      .sort((a, b) => Math.abs(parseFloat(b.funding_rate)) - Math.abs(parseFloat(a.funding_rate)))
      .slice(0, 5); // Топ 5
    
    let message = `🚨 <b>ВЫСОКИЕ ФАНДИНГОВЫЕ СТАВКИ</b> 🚨\n\n`;
    message += `📊 Найдено ${highFundingRates.length} ставок ≥ ${threshold}%\n\n`;
    
    sortedRates.forEach((rate, index) => {
      const fundingPercent = parseFloat(rate.funding_rate);
      
      // Разные эмодзи для разных бирж
      let exchangeEmoji = '📉'; // По умолчанию
      if (rate.exchange === 'BYBIT') {
        exchangeEmoji = fundingPercent > 0 ? '🟡' : '📉'; // 🟡 для BYBIT
      } else if (rate.exchange === 'BINANCE') {
        exchangeEmoji = fundingPercent > 0 ? '🟨' : '📉'; // 🟨 для BINANCE
      } else if (rate.exchange === 'OKX') {
        exchangeEmoji = fundingPercent > 0 ? '⚫' : '📉'; // ⚫ для OKX
      } else if (rate.exchange === 'GATE') {
        exchangeEmoji = fundingPercent > 0 ? '🔵' : '📉'; // 🔵 для GATE
      }
      
      const direction = fundingPercent > 0 ? 'LONG платит SHORT' : 'SHORT платит LONG';
      
      // Ссылки на биржи
      let exchangeLink = '';
      const symbol = rate.symbol.replace('USDT', '/USDT');
      
      if (rate.exchange === 'BYBIT') {
        exchangeLink = `https://www.bybit.com/trade/usdt/${rate.symbol}`;
      } else if (rate.exchange === 'BINANCE') {
        exchangeLink = `https://www.binance.com/ru/futures/${rate.symbol}`;
      } else if (rate.exchange === 'OKX') {
        exchangeLink = `https://www.okx.com/trade-swap/${rate.symbol.toLowerCase()}`;
      } else if (rate.exchange === 'GATE') {
        exchangeLink = `https://www.gate.com/trade/${rate.symbol.replace('USDT', '_USDT')}`;
      }
      
      message += `${exchangeEmoji} <b>${rate.exchange}</b> - <a href="${exchangeLink}">${rate.symbol}</a>\n`;
      message += `💰 Фандинг: <b>${rate.funding_rate}%</b>\n`;
      message += `🔄 ${direction}\n`;
      if (rate.next_funding_time) {
        const nextTime = new Date(parseInt(rate.next_funding_time));
        // Конвертируем в UTC+2 (киевское время)
        const kievTime = new Date(nextTime.getTime() + (2 * 60 * 60 * 1000));
        message += `⏰ Следующий: ${kievTime.toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric'})}, ${kievTime.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}\n`;
      }
      message += `\n`;
    });
    
    // Время сканирования в киевском времени (UTC+2)
    const scanTime = new Date();
    const kievScanTime = new Date(scanTime.getTime() + (2 * 60 * 60 * 1000));
    message += `🕐 Время сканирования: ${kievScanTime.toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric'})}, ${kievScanTime.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}\n`;
    message += `🤖 Crypto Trading Bot`;
    
    const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      console.log('💰 Telegram notification sent successfully');
    } else {
      console.error('💰 Telegram notification failed:', result);
    }
    
  } catch (error) {
    console.error('💰 Telegram notification error:', error);
  }
}

// Получение истории фандинга
async function getFundingHistory() {
  try {
    // Здесь можно добавить логику для получения истории из базы данных
    // Пока возвращаем заглушку
    return {
      message: "История фандинга будет добавлена в следующих версиях",
      last_scan: new Date().toISOString()
    };
  } catch (error) {
    console.error('💰 Get funding history error:', error);
    throw error;
  }
}