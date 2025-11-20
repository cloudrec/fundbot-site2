import ccxt from 'ccxt';

export interface FundingOpportunity {
  exchange: string;
  symbol: string;
  funding_rate_percent: number;
  profit_potential: number;
  next_funding_time: string;
}

// Получение фандинг ставок от конкретной биржи
export const fetchExchangeFundingRates = async (exchangeName: string): Promise<FundingOpportunity[]> => {
  try {
    let exchange;
    
    // Инициализируем биржу
    switch (exchangeName) {
      case 'binance':
        exchange = new ccxt.binance({ enableRateLimit: true });
        break;
      case 'bybit':
        exchange = new ccxt.bybit({ enableRateLimit: true });
        break;
      case 'okx':
        exchange = new ccxt.okx({ enableRateLimit: true });
        break;
      case 'kucoin':
        exchange = new ccxt.kucoin({ enableRateLimit: true });
        break;
      case 'gateio':
        exchange = new ccxt.gateio({ enableRateLimit: true });
        break;
      case 'mexc':
        exchange = new ccxt.mexc({ enableRateLimit: true });
        break;
      case 'bitget':
        exchange = new ccxt.bitget({ enableRateLimit: true });
        break;
      default:
        return [];
    }

    console.log(`🔍 CCXT: Получаю данные от ${exchangeName.toUpperCase()}...`);

    // Получаем фандинг ставки
    const fundingRates = await exchange.fetchFundingRates();
    
    const opportunities: FundingOpportunity[] = [];
    
    for (const [symbol, rate] of Object.entries(fundingRates)) {
      if (rate && rate.fundingRate && Math.abs(rate.fundingRate) >= 0.003) {
        opportunities.push({
          exchange: exchangeName.charAt(0).toUpperCase() + exchangeName.slice(1),
          symbol: symbol,
          funding_rate_percent: rate.fundingRate * 100,
          profit_potential: Math.abs(rate.fundingRate) * 1000 * 3,
          next_funding_time: rate.fundingTimestamp ? new Date(rate.fundingTimestamp).toISOString() : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
        });
      }
    }

    console.log(`✅ CCXT ${exchangeName.toUpperCase()}: ${opportunities.length} возможностей`);
    return opportunities.slice(0, 10);

  } catch (error) {
    console.log(`⚠️ CCXT ${exchangeName.toUpperCase()}: API недоступен`, error);
    return [];
  }
};

// Получение данных от всех бирж
export const fetchAllExchangesFunding = async (): Promise<FundingOpportunity[]> => {
  console.log('🚀 CCXT: Запускаю реальное сканирование всех бирж...');
  
  const exchangeNames = ['binance', 'bybit', 'okx', 'kucoin', 'gateio', 'mexc', 'bitget'];
  
  // Параллельные запросы ко всем биржам
  const results = await Promise.allSettled(
    exchangeNames.map(name => fetchExchangeFundingRates(name))
  );
  
  // Объединяем все результаты
  const allOpportunities: FundingOpportunity[] = [];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allOpportunities.push(...result.value);
    } else {
      console.log(`❌ CCXT ${exchangeNames[index].toUpperCase()}: Ошибка получения данных`);
    }
  });
  
  // Убираем дубликаты и сортируем
  const uniqueData = allOpportunities.reduce((acc, current) => {
    const key = `${current.symbol}-${current.exchange}`;
    const existing = acc.find(item => `${item.symbol}-${item.exchange}` === key);
    if (!existing) {
      acc.push(current);
    }
    return acc;
  }, [] as FundingOpportunity[]);
  
  const sortedData = uniqueData.sort((a, b) => Math.abs(b.funding_rate_percent) - Math.abs(a.funding_rate_percent));
  const finalData = sortedData.slice(0, 25);
  
  const exchangeCount = new Set(finalData.map(o => o.exchange)).size;
  console.log(`✅ CCXT: Объединено ${finalData.length} возможностей с ${exchangeCount} бирж`);
  
  return finalData;
};
