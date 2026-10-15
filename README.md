# Discord-Übersetzer Deutsch ↔ Russisch

Ein Discord-Bot, der Deutsch und Russisch in beide Richtungen übersetzt. Für Übersetzung, Spracherkennung und Sprachausgabe nutzt er die OpenAI-API.

- **Text-Channels:** In freigeschalteten Channels wird jede Nachricht automatisch erkannt und als Antwort in die andere Sprache übersetzt.
- **Sprach- und Video-Channels** (optional, standardmäßig **aus**, einschalten mit `VOICE_ENABLED=true`): Der Bot hört zu und übersetzt das Gesprochene. Die Ausgabe ist umschaltbar:
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
| `/voice start [modus]` *(nur mit `VOICE_ENABLED=true`)* | alle | Bot kommt in deinen Voice-Channel (Standard: Text) |
| `/voice modus <modus>` | alle | Zwischen Text, Audio und Text + Audio umschalten |
| `/voice stop` | alle | Bot verlässt den Channel. Er geht auch von selbst, wenn niemand mehr da ist. |
| `/kosten anzeigen` | Server verwalten | Geschätzte Kosten für heute und diesen Monat und wie viel vom Budget verbraucht ist |
| `/kosten limit [tag] [monat]` | Server verwalten (oder `BOT_ADMIN_IDS`) | Kostensperre in USD einstellen, `0` = kein Limit |

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
📖 **Ausführliche Anleitung für Einsteiger mit Test am PC und Dauerbetrieb auf VPS oder Raspberry Pi: [docs/HOSTING.md](docs/HOSTING.md)**

Benötigt wird **Node.js 22.12 oder neuer**.

```bash
git clone <dieses-repo>
cd discord-translator-de-ru
npm install
cp .env.example .env   # danach DISCORD_TOKEN und OPENAI_API_KEY eintragen
npm start
```

Tipp: Mit `DEV_GUILD_ID` (der ID deines Servers) erscheinen die Slash-Befehle sofort. Ohne diese Angabe kann es bis zu einer Stunde dauern.

Der Bot muss dauerhaft laufen, zum Beispiel auf einem kleinen VPS oder einem Raspberry Pi. Auf Linux richtet ihn `bash scripts/install-linux.sh` als Dienst mit Autostart ein.

## Kosten (Richtwerte, Stand 2026)

| Nutzung | ca. Kosten |
|---|---|
| Textchat, 1.000–2.000 Nachrichten pro Tag | **2–5 $ im Monat** |
| Voice, Modus Text | **~0,20 $ pro Stunde Sprechzeit** |
| Voice, Modus Audio bzw. Text + Audio | **~0,80–1,20 $ pro Stunde Sprechzeit** |

Stille kostet nichts. Abgerechnet wird nur, wenn jemand spricht.

### Kostensperre
Der Bot schätzt bei jeder Anfrage die Kosten und hört auf zu übersetzen, sobald ein Budget erreicht ist:

- **Tagesbudget** (Standard **2 $**): Am nächsten Tag (UTC) geht es automatisch weiter.
- **Monatsbudget** (Standard **20 $**): Ab dem nächsten Monat geht es automatisch weiter.

Ist die Sperre aktiv, postet der Bot in jedem betroffenen Channel **einmal** einen Hinweis auf Deutsch und Russisch. Danach ist er still, bis wieder Budget da ist.

- **Einstellen:** im Betrieb mit `/kosten limit tag:1 monat:15`. Der Wert wird gespeichert und hat Vorrang vor der `.env`. `0` schaltet das jeweilige Limit ab.
- **Rechte:** Mit `BOT_ADMIN_IDS` in der `.env` (deine Discord-User-ID) darfst nur du das Limit ändern.
- **Stand prüfen:** `/kosten anzeigen` zeigt, wie viel verbraucht ist. Ab 80 % erscheint ein ⚠️.
- **Zusätzlich für Voice:** `VOICE_DAILY_MINUTE_LIMIT` (Standard 180) begrenzt die Minuten Sprache pro Tag.

> Die Sperre arbeitet mit **Schätzwerten**. Die Preise lassen sich bei Bedarf über `PRICE_*` in der `.env` anpassen. Als zweite Sicherung solltest du bei OpenAI unter *Settings → Limits* ein hartes Monatslimit setzen.

## Konfiguration (`.env`)

| Variable | Standard | Bedeutung |
|---|---|---|
| `DISCORD_TOKEN` | – | Bot-Token (Pflicht) |
| `OPENAI_API_KEY` | – | OpenAI-Key (Pflicht) |
| `VOICE_ENABLED` | `false` | Sprachübersetzung an/aus. Aus = reiner Textübersetzer, `/voice` wird ausgeblendet |
| `DEV_GUILD_ID` | leer | Befehle nur auf diesem Server registrieren, dafür sofort sichtbar |
| `TRANSLATE_MODEL` | `gpt-4o-mini` | Modell für die Übersetzung |
| `STT_MODEL` | `gpt-4o-mini-transcribe` | Modell für die Spracherkennung |
| `TTS_MODEL` | `gpt-4o-mini-tts` | Modell für die Sprachausgabe |
| `TTS_VOICE` | `alloy` | Stimme: alloy, ash, coral, echo, nova, onyx, sage, shimmer … |
| `DAILY_BUDGET_USD` | `2` | Kostensperre pro Tag in USD (0 = aus) |
| `MONTHLY_BUDGET_USD` | `20` | Kostensperre pro Monat in USD (0 = aus) |
| `BOT_ADMIN_IDS` | leer | Nur diese User-IDs dürfen `/kosten limit` nutzen |
| `PRICE_INPUT_PER_MTOK` usw. | Richtwerte | Preise für die Kostenschätzung, falls OpenAI sie ändert |
| `VOICE_DAILY_MINUTE_LIMIT` | `180` | Höchstens so viele Minuten Sprache pro Tag (0 = unbegrenzt) |

## Hinweise
- **Datenschutz:** Gesprochenes und Nachrichten aus den freigeschalteten Channels werden zur Übersetzung an OpenAI gesendet. Beim Start im Voice-Channel weist der Bot auf Deutsch und Russisch darauf hin. Informiere deine Mitglieder trotzdem auch selbst darüber.
- **Audio-Modus:** Alle im Channel hören die Übersetzung. Mit Kopfhörern vermeidest du, dass Mikrofone die Bot-Stimme erneut aufnehmen.
- **Verzögerung:** Der Bot übersetzt nach jeder kurzen Sprechpause von etwa 1 Sekunde. Die Übersetzung kommt dann in der Regel nach 1–3 Sekunden.
- Einstellungen und Statistik liegen in `data/store.json`.
