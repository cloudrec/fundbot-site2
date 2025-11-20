// Minimal WS server wrapper to expose an endpoint for frontend connections
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('ws connected');
  ws.send(JSON.stringify({ type: 'hello', ts: Date.now() }));
});

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

const PORT = Number(process.env.WS_PORT || 3004);
server.listen(PORT, () => console.log('ws server listening on', PORT));
