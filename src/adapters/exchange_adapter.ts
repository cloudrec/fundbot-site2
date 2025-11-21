export interface FundingInfo {
  symbol: string;
  fundingRate: number;
  nextFundingTs?: number; // unix ms if available
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface ExchangeAdapter {
  id: string;
  fetchServerTime(): Promise<number>;
  fetchTickerPrice(symbol: string): Promise<number>;
  fetchOrderBook(symbol: string, limit?: number): Promise<OrderBook>;
  fetch24hVolume(symbol: string): Promise<number>; // USD volume
  fetchFundingInfo(symbol: string): Promise<FundingInfo | null>;
  computeContractsFromUsd(symbol: string, usdValue: number, price?: number): Promise<number>;
  setLeverage?(symbol: string, leverage: number): Promise<void>;
  createLimitOrder(symbol: string, side: 'buy'|'sell', amount: number, price: number, params?: any): Promise<any>;
  cancelOrder(orderId: string, symbol: string): Promise<any>;
  fetchOpenOrders(symbol?: string): Promise<any[]>;
  fetchPositions?(symbol?: string): Promise<any[]>;
}