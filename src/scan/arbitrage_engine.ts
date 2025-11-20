import { ExchangeAdapter } from "../adapters/exchange_adapter";

export type Opportunity = {
  id: string;
  type: 'pair' | 'triangular';
  exchanges: string[]; // involved exchanges
  symbol: string; // primary symbol
  spread: number; // relative spread in percent
  sizeUsd: number;
  createdAt: number;
};

export class ArbitrageEngine {
  adapters: Map<string, ExchangeAdapter>;
  onOpportunity: (opp: Opportunity) => void;

  constructor(adapters: ExchangeAdapter[], onOpportunity: (opp: Opportunity) => void) {
    this.adapters = new Map(adapters.map(a => [a.id, a]));
    this.onOpportunity = onOpportunity;
  }

  async scanPair(exchangeA: ExchangeAdapter, exchangeB: ExchangeAdapter, symbol: string) {
    // fetch orderbooks and 24h volume
    const [bookA, bookB] = await Promise.all([
      exchangeA.fetchOrderBook(symbol, 50),
      exchangeB.fetchOrderBook(symbol, 50),
    ]);
    // quick top-of-book check
    const bestBidA = bookA.bids[0]?.price || 0;
    const bestAskB = bookB.asks[0]?.price || Infinity;
    if (!bestBidA || !bestAskB) return;

    // compute spread as (bid_A / ask_B - 1) * 100  (A sell, B buy)
    const spreadPct = (bestBidA / bestAskB - 1) * 100;
    const minLiquidityUsd = 1000; // placeholder: compute from orderbook depths later

    if (spreadPct > 0.1) { // configurable threshold (0.1%)
      const opp = {
        id: `${exchangeA.id}_${exchangeB.id}_${symbol}_${Date.now()}`,
        type: 'pair' as const,
        exchanges: [exchangeA.id, exchangeB.id],
        symbol,
        spread: spreadPct,
        sizeUsd: minLiquidityUsd,
        createdAt: Date.now(),
      };
      this.onOpportunity(opp);
    }
  }

  async runOnceForSymbols(symbols: string[]) {
    const adapters = Array.from(this.adapters.values());
    // simple O(N^2) pair scanning for MVP
    for (let i = 0; i < adapters.length; i++) {
      for (let j = 0; j < adapters.length; j++) {
        if (i === j) continue;
        for (const s of symbols) {
          try {
            await this.scanPair(adapters[i], adapters[j], s);
          } catch (e) {
            console.error("scan error", adapters[i].id, adapters[j].id, s, e);
          }
        }
      }
    }
  }
}