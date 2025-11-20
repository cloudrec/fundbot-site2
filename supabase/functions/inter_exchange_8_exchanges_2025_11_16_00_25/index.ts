import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

interface ArbitrageOpportunity {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  volume24h: number;
  potentialProfit: number;
  risk: string;
}

interface ArbitrageSummary {
  totalOpportunities: number;
  avgSpread: number;
  maxSpread: number;
  totalPotentialProfit: number;
  activeExchanges: number;
}

// Функции для получения данных с каждой биржи
async function fetchBinanceData() {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const data = await response.json();
    return data.filter(item => 
      item.symbol.endsWith('USDT') && 
      parseFloat(item.quoteVolume) > 20000000
    ).map(item => ({
      exchange: 'Binance',
      symbol: item.symbol,
      price: parseFloat(item.lastPrice),
      volume: parseFloat(item.quoteVolume)
    }));
  } catch (error) {
    console.error('Binance error:', error);
    return [];
  }
}

async function fetchBybitData() {
  try {
    const response = await fetch('https://api.bybit.com/v5/market/tickers?category=spot');
    const data = await response.json();
    return data.result.list.filter(item => 
      item.symbol.endsWith('USDT') && 
      parseFloat(item.turnover24h) > 20000000
    ).map(item => ({
      exchange: 'Bybit',
      symbol: item.symbol,
      price: parseFloat(item.lastPrice),
      volume: parseFloat(item.turnover24h)
    }));
  } catch (error) {
    console.error('Bybit error:', error);
    return [];
  }
}

async function fetchOKXData() {
  try {
    const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
    const data = await response.json();
    return data.data.filter(item => 
      item.instId.endsWith('-USDT') && 
      parseFloat(item.volCcy24h) > 20000000
    ).map(item => ({
      exchange: 'OKX',
      symbol: item.instId.replace('-', ''),
      price: parseFloat(item.last),
      volume: parseFloat(item.volCcy24h)
    }));
  } catch (error) {
    console.error('OKX error:', error);
    return [];
  }
}

async function fetchKuCoinData() {
  try {
    const response = await fetch('https://api.kucoin.com/api/v1/market/allTickers');
    const data = await response.json();
    return data.data.ticker.filter(item => 
      item.symbol.endsWith('-USDT') && 
      parseFloat(item.volValue) > 20000000
    ).map(item => ({
      exchange: 'KuCoin',
      symbol: item.symbol.replace('-', ''),
      price: parseFloat(item.last),
      volume: parseFloat(item.volValue)
    }));
  } catch (error) {
    console.error('KuCoin error:', error);
    return [];
  }
}

async function fetchGateData() {
  try {
    const response = await fetch('https://api.gateio.ws/api/v4/spot/tickers');
    const data = await response.json();
    return data.filter(item => 
      item.currency_pair.endsWith('_USDT') && 
      parseFloat(item.quote_volume) > 20000000
    ).map(item => ({
      exchange: 'Gate.io',
      symbol: item.currency_pair.replace('_', ''),
      price: parseFloat(item.last),
      volume: parseFloat(item.quote_volume)
    }));
  } catch (error) {
    console.error('Gate.io error:', error);
    return [];
  }
}

async function fetchMEXCData() {
  try {
    const response = await fetch('https://api.mexc.com/api/v3/ticker/24hr');
    const data = await response.json();
    return data.filter(item => 
      item.symbol.endsWith('USDT') && 
      parseFloat(item.quoteVolume) > 20000000
    ).map(item => ({
      exchange: 'MEXC',
      symbol: item.symbol,
      price: parseFloat(item.lastPrice),
      volume: parseFloat(item.quoteVolume)
    }));
  } catch (error) {
    console.error('MEXC error:', error);
    return [];
  }
}

async function fetchBitgetData() {
  try {
    const response = await fetch('https://api.bitget.com/api/spot/v1/market/tickers');
    const data = await response.json();
    return data.data.filter(item => 
      item.symbol.endsWith('USDT') && 
      parseFloat(item.quoteVol) > 20000000
    ).map(item => ({
      exchange: 'Bitget',
      symbol: item.symbol,
      price: parseFloat(item.close),
      volume: parseFloat(item.quoteVol)
    }));
  } catch (error) {
    console.error('Bitget error:', error);
    return [];
  }
}

async function fetchHuobiData() {
  try {
    const response = await fetch('https://api.huobi.pro/market/tickers');
    const data = await response.json();
    return data.data.filter(item => 
      item.symbol.endsWith('usdt') && 
      item.vol > 20000000
    ).map(item => ({
      exchange: 'Huobi',
      symbol: item.symbol.toUpperCase(),
      price: item.close,
      volume: item.vol
    }));
  } catch (error) {
    console.error('Huobi error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔍 Сканирование межбиржевого арбитража на 8 биржах...');

    // Параллельно получаем данные со всех 8 бирж
    const [binanceData, bybitData, okxData, kucoinData, gateData, mexcData, bitgetData, huobiData] = await Promise.allSettled([
      fetchBinanceData(),
      fetchBybitData(), 
      fetchOKXData(),
      fetchKuCoinData(),
      fetchGateData(),
      fetchMEXCData(),
      fetchBitgetData(),
      fetchHuobiData()
    ]);

    // Собираем успешные результаты
    const allData = [];
    const exchanges = ['Binance', 'Bybit', 'OKX', 'KuCoin', 'Gate.io', 'MEXC', 'Bitget', 'Huobi'];
    const results = [binanceData, bybitData, okxData, kucoinData, gateData, mexcData, bitgetData, huobiData];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allData.push(...result.value);
        console.log(`✅ ${exchanges[index]}: ${result.value.length} символов`);
      } else {
        console.log(`❌ ${exchanges[index]}: недоступна`);
      }
    });

    // Группируем по символам
    const symbolGroups = {};
    allData.forEach(item => {
      if (!symbolGroups[item.symbol]) {
        symbolGroups[item.symbol] = [];
      }
      symbolGroups[item.symbol].push(item);
    });

    // Находим арбитражные возможности
    const opportunities: ArbitrageOpportunity[] = [];
    
    Object.entries(symbolGroups).forEach(([symbol, exchanges]) => {
      if (exchanges.length >= 2) {
        const sortedByPrice = exchanges.sort((a, b) => a.price - b.price);
        const lowest = sortedByPrice[0];
        const highest = sortedByPrice[sortedByPrice.length - 1];
        
        const spread = highest.price - lowest.price;
        const spreadPercent = (spread / lowest.price) * 100;
        
        if (spreadPercent >= 0.5) { // Минимальный спред 0.5%
          const testAmount = 1000; // 000 тест
          const fees = 0.004; // 0.2% на каждой бирже
          const potentialProfit = (testAmount * spreadPercent / 100) - (testAmount * fees);
          
          if (potentialProfit > 0) {
            opportunities.push({
              symbol,
              buyExchange: lowest.exchange,
              sellExchange: highest.exchange,
              buyPrice: lowest.price,
              sellPrice: highest.price,
              spread,
              spreadPercent,
              volume24h: Math.min(lowest.volume, highest.volume),
              potentialProfit,
              risk: spreadPercent > 2 ? 'Высокий' : spreadPercent > 1 ? 'Средний' : 'Низкий'
            });
          }
        }
      }
    });

    // Сортируем по потенциальной прибыли
    opportunities.sort((a, b) => b.potentialProfit - a.potentialProfit);
    const topOpportunities = opportunities.slice(0, 30);

    // Создаем сводку
    const summary: ArbitrageSummary = {
      totalOpportunities: topOpportunities.length,
      avgSpread: topOpportunities.length > 0 ? 
        topOpportunities.reduce((sum, op) => sum + op.spreadPercent, 0) / topOpportunities.length : 0,
      maxSpread: topOpportunities.length > 0 ? Math.max(...topOpportunities.map(op => op.spreadPercent)) : 0,
      totalPotentialProfit: topOpportunities.reduce((sum, op) => sum + op.potentialProfit, 0),
      activeExchanges: new Set(allData.map(item => item.exchange)).size
    };

    console.log(`📊 Найдено ${topOpportunities.length} возможностей на ${summary.activeExchanges} биржах`);

    return new Response(JSON.stringify({
      success: true,
      opportunities: topOpportunities,
      summary,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Ошибка сканирования:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      opportunities: [],
      summary: {
        totalOpportunities: 0,
        avgSpread: 0,
        maxSpread: 0,
        totalPotentialProfit: 0,
        activeExchanges: 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
