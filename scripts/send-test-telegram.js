// Simple test sender for Telegram notifications (uses node-fetch)
const fetch = require('node-fetch');

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
if (!BOT || !CHAT) {
  console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
  process.exit(2);
}

const text = process.argv.slice(2).join(' ') || 'Test message from fundbot-site2 scanner (MVP A)';
const url = `https://api.telegram.org/bot${BOT}/sendMessage`;
(async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text }),
  });
  const data = await res.json();
  console.log('send result', data);
})();
