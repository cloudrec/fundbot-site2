// Skeleton Bybit adapter (minimal, ccxt)
import ccxt from 'ccxt';
import type { ExchangeAdapter, OrderBook, FundingInfo } from './exchange_adapter';

export const BybitAdapter = (opts: { apiKey?: string; secret?: string; test?: boolean }): ExchangeAdapter => {
  const id = 'bybit';
  const exchange = new (ccxt as any).bybit({
    apiKey: opts.apiKey,
    secret: opts.secret,
    enableRateLimit: true,
    timeout: 30000,
  });

  return {
    id,
    async fetchServerTime() { return Date.now(); },
    async fetchTickerPrice(symbol: string) {
      const t = await exchange.fetchTicker(symbol);
      return Number(t.last);
    },
    async fetchOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
      const ob = await exchange.fetchOrderBook(symbol, limit);
      return {
        bids: (ob.bids || []).map(([p, s]) => ({ price: p, size: s })),
        asks: (ob.asks || []).map(([p, s]) => ({ price: p, size: s })),
        timestamp: ob.timestamp || Date.now(),
      };
    },
    async fetch24hVolume(symbol: string) {
      const t = await exchange.fetchTicker(symbol);
      return Number(t.quoteVolume || 0) * Number(t.last || 0);
    },
    async fetchFundingInfo(symbol: string): Promise<FundingInfo | null> {
      return null;
    },
    async computeContractsFromUsd(symbol: string, usdValue: number) {
      const price = await this.fetchTickerPrice(symbol);
      return usdValue / price;
    },
    async createLimitOrder(symbol, side, amount, price, params?: any) {
      return exchange.createLimitOrder(symbol, side, amount, price, params);
    },
    async cancelOrder(orderId: string, symbol: string) {
      return exchange.cancelOrder(orderId, symbol);
    },
    async fetchOpenOrders(symbol?: string) {
      return exchange.fetchOpenOrders(symbol);
    },
    async fetchPositions() { return []; },
  };
};
