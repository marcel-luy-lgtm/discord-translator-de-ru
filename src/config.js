import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Fehlende Umgebungsvariable: ${name} (siehe .env.example)`);
    process.exit(1);
  }
  return value;
}

export const config = {
  discordToken: required('DISCORD_TOKEN'),
  openaiApiKey: required('OPENAI_API_KEY'),
  devGuildId: process.env.DEV_GUILD_ID?.trim() || null,
  translateModel: process.env.TRANSLATE_MODEL?.trim() || 'gpt-4o-mini',
  sttModel: process.env.STT_MODEL?.trim() || 'gpt-4o-mini-transcribe',
  ttsModel: process.env.TTS_MODEL?.trim() || 'gpt-4o-mini-tts',
  ttsVoice: process.env.TTS_VOICE?.trim() || 'alloy',
  voiceDailyMinuteLimit: Number(process.env.VOICE_DAILY_MINUTE_LIMIT ?? 180) || 0,
};
