#!/usr/bin/env bash
# Installiert den Bot als Dienst auf Linux (Ubuntu/Debian, z. B. VPS oder Raspberry Pi OS).
# Aufruf im Repo-Ordner:  bash scripts/install-linux.sh
# Danach läuft der Bot dauerhaft und startet nach Absturz oder Neustart automatisch.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE=discord-translator
RUN_USER="${SUDO_USER:-$USER}"

echo "==> Ordner: $APP_DIR (Benutzer: $RUN_USER)"

# 1) Node.js 22 installieren, falls nicht vorhanden oder zu alt
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 22 ] && need_node=0
fi
if [ "$need_node" = 1 ]; then
  echo "==> Installiere Node.js 22 ..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "==> Node.js $(node -v)"

# 2) Abhängigkeiten
cd "$APP_DIR"
npm ci --omit=dev

# 3) .env anlegen (fragt Token und Key ab, falls noch keine .env existiert)
if [ ! -f .env ]; then
  cp .env.example .env
  # -s: Eingabe wird nicht angezeigt (Token/Key sollen nicht auf dem Bildschirm stehen)
  read -rsp "Discord-Bot-Token (Eingabe unsichtbar): " token; echo
  read -rsp "OpenAI-API-Key (Eingabe unsichtbar): " key; echo
  sed -i "s|^DISCORD_TOKEN=.*|DISCORD_TOKEN=$token|; s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$key|" .env
  chmod 600 .env
  echo "==> .env erstellt (weitere Einstellungen: nano $APP_DIR/.env)"
fi

# 4) systemd-Dienst einrichten
sudo tee /etc/systemd/system/$SERVICE.service >/dev/null <<UNIT
[Unit]
Description=Discord-Übersetzer DE-RU
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now $SERVICE
sleep 3
sudo systemctl --no-pager --lines=10 status $SERVICE || true

cat <<INFO

✅ Fertig! Der Bot läuft jetzt dauerhaft.
   Logs ansehen:     journalctl -u $SERVICE -f
   Neu starten:      sudo systemctl restart $SERVICE   (z. B. nach Änderung der .env)
   Stoppen:          sudo systemctl stop $SERVICE
   Update:           git pull && npm ci --omit=dev && sudo systemctl restart $SERVICE
INFO
