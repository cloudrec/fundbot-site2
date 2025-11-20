# Roadmap (web-first, fast MVP)

Цель: запустить веб‑сайт с фоновым сканером арбитражных спредов и минимальным автотрейдингом (лимитные ордера) как можно быстрее.

Phase 0 - Immediate (0-24h)
- Fork repo → create feature/web-first branch.
- Add .env.example, docs, and CI skeleton.
- Add ExchangeAdapter interface and skeleton scanner.
- Simple UI endpoint to show found opportunities (no auth yet).

Phase 1 - MVP (1-3 days)
- Implement Bybit + Binance adapters (testnet support).
- Implement scanner that finds two-exchange spreads and triangular spreads.
- WebSocket endpoint to push opportunities to frontend.
- Telegram notifications on new opportunity and on trade close.

Phase 2 - Trading engine (3-7 days)
- Implement coordinated limit order entry/monitoring state machine.
- Confirm funding via fetchFundingHistory before exiting.
- Basic PnL calculation, logging, and trade detail page.

Phase 3 - Expansion (1-4 weeks)
- Add other exchanges: Gate, KuCoin, OKX, Bitget, Huobi, MEXC.
- Add billing engine and daily 20% fee invoicing.
- Desktop (Electron) agent for reading keys from USB and local signing.

Phase 4 - Hardening and scaling
- Monitoring, rate-limiter, retry/backoff, security audit.
- Admin panel, tariff management, partner program.