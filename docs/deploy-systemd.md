# Deploy without Docker (systemd) — quick notes

1. Create system user:
   sudo adduser --system --group --home /opt/fundbot fundbot

2. Clone repo to /opt/fundbot/repo (or use fork clone).

3. Create /etc/fundbot/env with required variables (set correct permissions 640 root:fundbot).

4. Systemd unit examples (place in /etc/systemd/system/):
   - fundbot-backend.service -> runs Node balance API
   - fundbot-scanner.service -> runs Node/Deno scanner

5. Enable & start:
   sudo systemctl daemon-reload
   sudo systemctl enable --now fundbot-backend fundbot-scanner

6. Logs:
   journalctl -u fundbot-backend -f
