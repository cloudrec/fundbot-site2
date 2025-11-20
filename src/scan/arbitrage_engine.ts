// Minimal ArbitrageEngine for MVP A - detects inter-exchange arbitrage opportunities
import type { ExchangeAdapter } from '../adapters/exchange_adapter';

export interface Opportunity {
  type: 'inter-exchange' | 'triangular';
  symbol: string;
  exchanges: string[];
  spread: number;
  sizeUsd: number;
  createdAt: number;
  buyExchange?: string;
  sellExchange?: string;
  buyPrice?: number;
  sellPrice?: number;
}

export class ArbitrageEngine {
  private adapters: ExchangeAdapter[];
  private onOpportunity: (opp: Opportunity) => void;

  constructor(adapters: ExchangeAdapter[], onOpportunity: (opp: Opportunity) => void) {
    this.adapters = adapters;
    this.onOpportunity = onOpportunity;
  }

  async runOnceForSymbols(symbols: string[]) {
    for (const symbol of symbols) {
      await this.scanInterExchange(symbol);
    }
  }

  private async scanInterExchange(symbol: string) {
    const prices: Array<{ exchange: string; price: number }> = [];
    
    for (const adapter of this.adapters) {
      try {
        const price = await adapter.fetchTickerPrice(symbol);
        prices.push({ exchange: adapter.id, price });
      } catch (err) {
        console.error(`Error fetching ${symbol} from ${adapter.id}:`, err);
      }
    }

    if (prices.length < 2) return;

    // Find best bid and ask across exchanges
    const sorted = prices.sort((a, b) => a.price - b.price);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    const spread = ((highest.price - lowest.price) / lowest.price) * 100;
    const minSpreadThreshold = Number(process.env.MIN_SPREAD_PERCENT || 0.1);

    if (spread > minSpreadThreshold) {
      const opp: Opportunity = {
        type: 'inter-exchange',
        symbol,
        exchanges: [lowest.exchange, highest.exchange],
        spread,
        sizeUsd: 1000, // placeholder
        createdAt: Date.now(),
        buyExchange: lowest.exchange,
        sellExchange: highest.exchange,
        buyPrice: lowest.price,
        sellPrice: highest.price,
      };
      this.onOpportunity(opp);
    }
  }
}
