// Exchange adapter interface for MVP A
export interface OrderBook {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  timestamp: number;
}

export interface FundingInfo {
  rate: number;
  nextFundingTime: number;
}

export interface ExchangeAdapter {
  id: string;
  fetchServerTime(): Promise<number>;
  fetchTickerPrice(symbol: string): Promise<number>;
  fetchOrderBook(symbol: string, limit?: number): Promise<OrderBook>;
  fetch24hVolume(symbol: string): Promise<number>;
  fetchFundingInfo(symbol: string): Promise<FundingInfo | null>;
  computeContractsFromUsd(symbol: string, usdValue: number): Promise<number>;
  setLeverage?(symbol: string, leverage: number): Promise<void>;
  createLimitOrder(symbol: string, side: string, amount: number, price: number, params?: any): Promise<any>;
  cancelOrder(orderId: string, symbol: string): Promise<any>;
  fetchOpenOrders(symbol?: string): Promise<any[]>;
  fetchPositions(): Promise<any[]>;
}
