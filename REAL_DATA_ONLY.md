# 🚨 КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ

## ❌ ЗАПРЕЩЕНО НАВСЕГДА:
- Симуляция данных
- Генерация фейковых ставок
- Демо данные
- Любые искусственные данные

## ✅ РАЗРЕШЕНО ТОЛЬКО:
- Реальные API вызовы к биржам
- Настоящие фандинг ставки
- Живые данные с бирж
- Реальные цены и объемы

## 🎯 ПРИЧИНА:
Проект предназначен для реального межбиржевого арбитража по фандингам.
Любые симулированные данные делают систему бесполезной для торговли.

## 🔧 ТЕХНИЧЕСКАЯ РЕАЛИЗАЦИЯ:
- Прямые HTTP запросы к API бирж
- CORS прокси для обхода ограничений браузера
- Обработка ошибок API
- Fallback только на другие реальные источники


## 🌐 РЕАЛЬНЫЕ API БИРЖИ:
- Binance: https://www.binance.com/ru/futures/funding-history
- Bybit: https://www.bybit.com/futures/funding-rate  
- OKX: https://www.okx.com/trade-market/analysis/funding-rate
- KuCoin: https://www.kucoin.com/ru/futures/funding-rate
- Gate.io: https://www.gate.io/futures/funding-rate
- MEXC: https://futures.mexc.com/funding-rate
- Bitget: https://www.bitget.com/ru/markets/funding-rate

## 🎯 КРИТЕРИИ ФИЛЬТРАЦИИ:
- Фандинг ставки ≥ +0.3% или ≤ -0.3%
- Только реальные данные с бирж
- API вызовы + HTML парсинг как fallback

