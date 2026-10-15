import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Fehlende Umgebungsvariable: ${name} (siehe .env.example)`);
    process.exit(1);
  }
  return value;
}

/** Zahl aus der Umgebung lesen; leer/ungültig -> Standardwert, negativ -> 0. */
function number(name, fallback) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

/** Ja/Nein-Schalter aus der Umgebung lesen (true/1/ja/on). */
function flag(name, fallback) {
  const raw = process.env[name]?.trim();
  return raw ? /^(1|true|yes|ja|on)$/i.test(raw) : fallback;
}

export const config = {
  discordToken: required('DISCORD_TOKEN'),
  openaiApiKey: required('OPENAI_API_KEY'),
  devGuildId: process.env.DEV_GUILD_ID?.trim() || null,
  translateModel: process.env.TRANSLATE_MODEL?.trim() || 'gpt-4o-mini',
  sttModel: process.env.STT_MODEL?.trim() || 'gpt-4o-mini-transcribe',
  ttsModel: process.env.TTS_MODEL?.trim() || 'gpt-4o-mini-tts',
  ttsVoice: process.env.TTS_VOICE?.trim() || 'alloy',
  // Kostensperre in USD (0 = kein Limit). Kann per /kosten limit überschrieben werden.
  dailyBudgetUsd: number('DAILY_BUDGET_USD', 2),
  monthlyBudgetUsd: number('MONTHLY_BUDGET_USD', 20),
  // Nur diese Discord-User-IDs dürfen die Kostensperre ändern (kommagetrennt). Leer = alle mit "Server verwalten".
  botAdminIds: (process.env.BOT_ADMIN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  // Sprach-/Video-Übersetzung ein- oder ausschalten. Aus = reiner Textübersetzer.
  voiceEnabled: flag('VOICE_ENABLED', false),
  voiceDailyMinuteLimit: number('VOICE_DAILY_MINUTE_LIMIT', 180),
};
