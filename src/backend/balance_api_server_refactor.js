// Lightweight refactor skeleton of balance_api_server.js for the fork PR.
// Reads supabase URL/key from process.env and does more robust parsing.

import express from 'express';
import cors from 'cors';
import ccxt from 'ccxt';

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('Supabase credentials not set in env. Running in limited mode.');
}

// robust parsing function for USDT balance
function parseUsdt(balance) {
  try {
    if (!balance) return 0;
    if (typeof balance === 'number') return balance;
    if (balance.USDT) {
      if (balance.USDT.total) return Number(balance.USDT.total);
      if (balance.USDT.free) return Number(balance.USDT.free);
    }
    if (balance.total && balance.total.USDT) return Number(balance.total.USDT);
    if (balance.free && balance.free.USDT) return Number(balance.free.USDT);
    for (const k of Object.keys(balance)) {
      if (k.toUpperCase() === 'USDT' && typeof balance[k] === 'object') {
        return Number(balance[k].total || balance[k].free || 0);
      }
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

export async function checkBalance(exchangeName, apiKey, secret, passphrase, testnet=false) {
  try {
    const config = {
      apiKey, secret, timeout: 30000, enableRateLimit: true
    };
    if (testnet) config['test'] = true;
    let ex;
    switch (exchangeName.toLowerCase()) {
      case 'bybit': ex = new ccxt.bybit(config); break;
      case 'binance': ex = new ccxt.binance(config); break;
      case 'gate.io': ex = new ccxt.gate(config); break;
      case 'kucoin': ex = new ccxt.kucoin(config); break;
      case 'okx': ex = new ccxt.okx(config); break;
      case 'mexc': ex = new ccxt.mexc(config); break;
      default: throw new Error('unsupported exchange');
    }
    const bal = await ex.fetchBalance();
    const usdt = parseUsdt(bal);
    return { success: true, balance: usdt };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

app.post('/check-balance', async (req, res) => {
  const { exchange, apiKey, secret, passphrase, testnet } = req.body;
  if (!exchange) return res.status(400).json({ success: false, error: 'exchange required' });
  try {
    const result = await checkBalance(exchange, apiKey, secret, passphrase, testnet);
    res.json(result);
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

export default app;