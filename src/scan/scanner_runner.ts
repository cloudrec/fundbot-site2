// Runner for MVP A: instantiate adapters, ArbitrageEngine, and broadcast opportunities via WS
import { ArbitrageEngine, Opportunity } from './arbitrage_engine';
import { BinanceAdapter } from '../adapters/binance_adapter';
import { BybitAdapter } from '../adapters/bybit_adapter';
import WebSocket from 'ws';

const wss = new WebSocket.Server({ port: Number(process.env.WS_PORT || 3004) });
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

function broadcast(obj: any) {
  const msg = JSON.stringify(obj);
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  }
}

async function main() {
  const binance = BinanceAdapter({ apiKey: process.env.BINANCE_API_KEY, secret: process.env.BINANCE_SECRET });
  const bybit = BybitAdapter({ apiKey: process.env.BYBIT_API_KEY, secret: process.env.BYBIT_SECRET });

  const engine = new ArbitrageEngine([binance, bybit], (opp: Opportunity) => {
    console.log('opp', opp);
    broadcast({ type: 'opportunity', data: opp });
  });

  const symbols = (process.env.SYMBOLS || 'BTC/USDT,ETH/USDT').split(',');
  const intervalMs = Number(process.env.SCAN_INTERVAL_MS || 5000);

  setInterval(async () => {
    try {
      await engine.runOnceForSymbols(symbols);
    } catch (e) {
      console.error('scan error', e);
    }
  }, intervalMs);

  console.log('scanner runner started, WS port', process.env.WS_PORT || 3004);
}

main().catch((e) => { console.error(e); process.exit(1); });
