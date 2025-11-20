// Исправление функции Binance для правильного расчета notional
const fs = require('fs');

// Читаем существующую функцию
const functionPath = 'supabase/functions/binance_quantity_fixed_v63_2025_11_10_21_10/index.ts';
let content = fs.readFileSync(functionPath, 'utf8');

// Заменяем расчет позиции на правильный
const oldCalculation = /const positionSize = parseFloat\(amount\) \/ parseFloat\(leverage\);/g;
const newCalculation = 'const positionSize = parseFloat(amount) * parseFloat(leverage);';

content = content.replace(oldCalculation, newCalculation);

// Заменяем минимум на 100 USD
const oldMinimum = /if \(positionSizeUSD < 5\)/g;
const newMinimum = 'if (positionSizeUSD < 100)';

content = content.replace(oldMinimum, newMinimum);

// Сохраняем исправленную функцию
fs.writeFileSync(functionPath, content);
console.log('✅ Binance function fixed!');
