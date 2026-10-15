# Bot zum Laufen bringen

Die Anleitung hat zwei Teile: Zuerst testest du den Bot auf deinem PC (**Teil A**). Danach richtest du ihn auf einem Server oder Raspberry Pi für den Dauerbetrieb ein (**Teil B**).

Vorher brauchst du den **Discord-Bot-Token** und den **OpenAI-API-Key**. Wie du beide bekommst, steht in der [README](../README.md#einrichtung), Schritte 1 und 2.

---

## Teil A – Test auf deinem PC (Windows oder Mac)

1. **Node.js** installieren: <https://nodejs.org>, Version „LTS“ (22 oder neuer) herunterladen und installieren.
2. **Code herunterladen:** Auf GitHub im Repo auf **Code → Download ZIP** klicken und das Archiv entpacken.
3. Im entpackten Ordner die Datei `.env.example` kopieren und die Kopie in `.env` umbenennen. Dann mit dem Editor öffnen und eintragen:
   ```
   DISCORD_TOKEN=dein-bot-token
   OPENAI_API_KEY=dein-openai-key
   DEV_GUILD_ID=id-deines-servers
   ```
   Die Server-ID bekommst du so: In Discord unter *Einstellungen → Erweitert* den **Entwicklermodus** einschalten, dann Rechtsklick auf deinen Server → *Server-ID kopieren*. Mit dieser ID erscheinen die Befehle sofort.
4. Im Ordner ein Terminal öffnen. Unter Windows: in die Adressleiste des Explorers `cmd` tippen und Enter drücken. Dann:
   ```
   npm install
   npm start
   ```
5. Erscheint `Eingeloggt als …`, schreibst du in Discord in einem Channel `/uebersetzen an` und testest mit einer deutschen oder russischen Nachricht.
6. Mit **Strg + C** stoppst du den Bot.

---

## Teil B – Dauerbetrieb auf einem VPS oder Raspberry Pi

Ein VPS und ein Raspberry Pi funktionieren gleich. Das Setup-Skript erledigt Installation und Autostart.

### 1. Server besorgen
- **VPS**, z. B. Hetzner Cloud, kleinster Server „CX22“ für ca. 4–5 €/Monat. Als Betriebssystem **Ubuntu 24.04** wählen. Die Zugangsdaten (IP und Passwort oder SSH-Key) bekommst du per Mail oder im Panel.
- **Raspberry Pi:** Mit dem *Raspberry Pi Imager* „Raspberry Pi OS Lite (64-bit)“ installieren und dabei SSH aktivieren.

### 2. Verbinden
Unter Windows: *PowerShell* öffnen. Am Mac: *Terminal* öffnen.
```bash
ssh root@DEINE-SERVER-IP        # Raspberry Pi: ssh pi@raspberrypi.local
```

### 3. Code holen
Dein Repo ist **privat**, deshalb fragt GitHub beim Klonen nach einem Login:
- **Benutzername:** dein GitHub-Name
- **Passwort:** ein **Personal Access Token**, nicht dein normales Passwort. Erstellen unter <https://github.com/settings/personal-access-tokens>: *Fine-grained*, nur dieses Repo, Recht *Contents: Read-only*.

```bash
sudo apt-get update && sudo apt-get install -y git curl
git clone https://github.com/marcel-luy-lgtm/discord-translator-de-ru.git
cd discord-translator-de-ru
```

### 4. Setup-Skript ausführen
```bash
bash scripts/install-linux.sh
```
Das Skript installiert Node.js, fragt nach Token und Key und richtet den Bot als Dienst ein. Danach läuft er **dauerhaft** und startet nach einem Absturz oder Neustart von selbst.

Weitere Einstellungen wie das Budget änderst du so:
```bash
nano .env                                   # speichern: Strg+O, Enter; beenden: Strg+X
sudo systemctl restart discord-translator
```

### Nützliche Befehle
| Was | Befehl |
|---|---|
| Live-Logs ansehen | `journalctl -u discord-translator -f` |
| Neu starten | `sudo systemctl restart discord-translator` |
| Stoppen | `sudo systemctl stop discord-translator` |
| Update einspielen | `git pull && npm ci --omit=dev && sudo systemctl restart discord-translator` |

---

## Sprachübersetzung später einschalten
In der `.env` diese Zeile setzen:
```
VOICE_ENABLED=true
```
Dann den Bot neu starten. Die Befehle `/voice …` erscheinen danach in Discord.
