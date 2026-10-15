# Discord-Übersetzer Deutsch ↔ Russisch

Ein Discord-Bot, der Deutsch und Russisch in beide Richtungen übersetzt. Für Übersetzung, Spracherkennung und Sprachausgabe nutzt er die OpenAI-API.

- **Text-Channels:** In freigeschalteten Channels wird jede Nachricht automatisch erkannt und als Antwort in die andere Sprache übersetzt.
- **Sprach- und Video-Channels:** Der Bot hört zu und übersetzt das Gesprochene. Die Ausgabe ist umschaltbar:
  - **Text:** Die Übersetzung erscheint im Chat des Voice-Channels, darunter klein das Original.
  - **Audio:** Der Bot spricht die Übersetzung.
  - **Text + Audio:** beides.

> Ausgewertet wird nur der Ton. Das Kamerabild verarbeitet der Bot nicht.

## Befehle

| Befehl | Wer | Was |
|---|---|---|
| `/uebersetzen an [channel]` | Server verwalten | Auto-Übersetzung in einem Channel einschalten |
| `/uebersetzen aus [channel]` | Server verwalten | Auto-Übersetzung ausschalten |
| `/uebersetzen liste` | Server verwalten | Alle aktiven Channels anzeigen |
| `/voice start [modus]` | alle | Bot kommt in deinen Voice-Channel (Standard: Text) |
| `/voice modus <modus>` | alle | Zwischen Text, Audio und Text + Audio umschalten |
| `/voice stop` | alle | Bot verlässt den Channel. Er geht auch von selbst, wenn niemand mehr da ist. |
| `/kosten` | Server verwalten | Geschätzte API-Kosten für heute und diesen Monat |

## Einrichtung

### 1. OpenAI-API-Key (ohne Abo, Prepaid)
Der Zugang ist **unabhängig von ChatGPT Plus**. Ein privates Konto reicht:
1. Auf <https://platform.openai.com> registrieren oder einloggen.
2. Unter *Settings → Billing* Guthaben aufladen. Ab 5 $ geht es los, abgerechnet wird nur die tatsächliche Nutzung.
3. Empfohlen: unter *Settings → Limits* ein monatliches Budget-Limit setzen.
4. Unter *API keys* einen Key erstellen und notieren.

### 2. Discord-Bot anlegen
1. Auf <https://discord.com/developers/applications> unter **New Application** eine Anwendung anlegen.
2. Im Reiter **Bot** mit *Reset Token* den Token kopieren.
3. Ebenfalls im Reiter **Bot** unter *Privileged Gateway Intents* den **Message Content Intent** einschalten.
4. Im Reiter **OAuth2 → URL Generator** die Scopes `bot` und `applications.commands` wählen. Als Rechte *View Channels, Send Messages, Read Message History, Connect, Speak* auswählen. Dann die erzeugte URL öffnen und den Bot einladen.

   Alternativ diesen Link verwenden, dabei `CLIENT_ID` durch die *Application ID* ersetzen:
   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=3214336`

### 3. Bot starten
Benötigt wird **Node.js 22.12 oder neuer**.

```bash
git clone <dieses-repo>
cd discord-translator-de-ru
npm install
cp .env.example .env   # danach DISCORD_TOKEN und OPENAI_API_KEY eintragen
npm start
```

Tipp: Mit `DEV_GUILD_ID` (der ID deines Servers) erscheinen die Slash-Befehle sofort. Ohne diese Angabe kann es bis zu einer Stunde dauern.

Der Bot muss dauerhaft laufen, zum Beispiel auf einem kleinen VPS oder einem Raspberry Pi. Damit er nach einem Absturz oder Neustart automatisch weiterläuft, eignet sich [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start src/index.js --name translator
pm2 save && pm2 startup
```

## Kosten (Richtwerte, Stand 2026)

| Nutzung | ca. Kosten |
|---|---|
| Textchat, 1.000–2.000 Nachrichten pro Tag | **2–5 $ im Monat** |
| Voice, Modus Text | **~0,20 $ pro Stunde Sprechzeit** |
| Voice, Modus Audio bzw. Text + Audio | **~0,80–1,20 $ pro Stunde Sprechzeit** |

Stille kostet nichts. Abgerechnet wird nur, wenn jemand spricht.

Als Kostenbremse transkribiert `VOICE_DAILY_MINUTE_LIMIT` (Standard: 180) höchstens so viele Minuten Sprache pro Tag. Den aktuellen Stand zeigt `/kosten`.

## Konfiguration (`.env`)

| Variable | Standard | Bedeutung |
|---|---|---|
| `DISCORD_TOKEN` | – | Bot-Token (Pflicht) |
| `OPENAI_API_KEY` | – | OpenAI-Key (Pflicht) |
| `DEV_GUILD_ID` | leer | Befehle nur auf diesem Server registrieren, dafür sofort sichtbar |
| `TRANSLATE_MODEL` | `gpt-4o-mini` | Modell für die Übersetzung |
| `STT_MODEL` | `gpt-4o-mini-transcribe` | Modell für die Spracherkennung |
| `TTS_MODEL` | `gpt-4o-mini-tts` | Modell für die Sprachausgabe |
| `TTS_VOICE` | `alloy` | Stimme: alloy, ash, coral, echo, nova, onyx, sage, shimmer … |
| `VOICE_DAILY_MINUTE_LIMIT` | `180` | Höchstens so viele Minuten Sprache pro Tag (0 = unbegrenzt) |

## Hinweise
- **Datenschutz:** Gesprochenes und Nachrichten aus den freigeschalteten Channels werden zur Übersetzung an OpenAI gesendet. Beim Start im Voice-Channel weist der Bot auf Deutsch und Russisch darauf hin. Informiere deine Mitglieder trotzdem auch selbst darüber.
- **Audio-Modus:** Alle im Channel hören die Übersetzung. Mit Kopfhörern vermeidest du, dass Mikrofone die Bot-Stimme erneut aufnehmen.
- **Verzögerung:** Der Bot übersetzt nach jeder kurzen Sprechpause von etwa 1 Sekunde. Die Übersetzung kommt dann in der Regel nach 1–3 Sekunden.
- Einstellungen und Statistik liegen in `data/store.json`.
