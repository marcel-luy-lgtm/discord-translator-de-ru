// Hilfsfunktionen für Audio: PCM -> WAV, Spracherkennung (STT) und Sprachausgabe (TTS).
import { toFile } from 'openai';
import { config } from './config.js';
import { openai } from './translate.js';
import { recordUsage } from './store.js';

export const SAMPLE_RATE = 48000;

/** Discord liefert 48 kHz Stereo s16le; für die Spracherkennung reicht Mono. */
export function stereoToMono(pcm) {
  const frames = Math.floor(pcm.length / 4);
  const out = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    const l = pcm.readInt16LE(i * 4);
    const r = pcm.readInt16LE(i * 4 + 2);
    out.writeInt16LE((l + r) >> 1, i * 2);
  }
  return out;
}

/** Lautstärke (RMS, 0..1) – um Rauschen/Atmen ohne Sprache herauszufiltern. */
export function rms(mono) {
  const samples = Math.floor(mono.length / 2);
  if (!samples) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const s = mono.readInt16LE(i * 2) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / samples);
}

export function monoToWav(mono, sampleRate = SAMPLE_RATE) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + mono.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt-Chunk-Größe
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // Byte-Rate
  header.writeUInt16LE(2, 32); // Block-Align
  header.writeUInt16LE(16, 34); // Bits pro Sample
  header.write('data', 36);
  header.writeUInt32LE(mono.length, 40);
  return Buffer.concat([header, mono]);
}

// Bekannte "Halluzinationen" der Spracherkennung bei Stille/Rauschen
const HALLUCINATIONS = [
  /untertitel (im auftrag|der amara|von)/i,
  /vielen dank (fürs|für's) zuschauen/i,
  /продолжение следует/i,
  /субтитры (сделал|создавал|подготовил)/i,
  /редактор субтитров/i,
  /спасибо за просмотр/i,
  /^\W*$/,
];

export async function transcribe(mono) {
  const seconds = mono.length / 2 / SAMPLE_RATE;
  const res = await openai.audio.transcriptions.create({
    file: await toFile(monoToWav(mono), 'speech.wav', { type: 'audio/wav' }),
    model: config.sttModel,
    prompt: 'Gespräch unter Freunden auf Deutsch oder Russisch. Разговор друзей на немецком или русском.',
  });
  recordUsage({ sttSeconds: seconds });
  const text = (res.text ?? '').trim();
  if (!text || HALLUCINATIONS.some((re) => re.test(text))) return '';
  return text;
}

const TTS_INSTRUCTIONS = {
  de: 'Sprich natürlich und zügig auf Deutsch, wie ein Dolmetscher in einem Gespräch unter Freunden.',
  ru: 'Говори естественно и в нормальном темпе по-русски, как переводчик в дружеской беседе.',
};

/** Liefert Ogg/Opus-Audio, das direkt in Discord abgespielt werden kann. */
export async function synthesize(text, lang) {
  const params = {
    model: config.ttsModel,
    voice: config.ttsVoice,
    input: text,
    response_format: 'opus',
  };
  // "instructions" wird nur von den gpt-4o*-tts-Modellen unterstützt
  if (!config.ttsModel.startsWith('tts-1')) params.instructions = TTS_INSTRUCTIONS[lang];
  const res = await openai.audio.speech.create(params);
  recordUsage({ ttsChars: text.length });
  return Buffer.from(await res.arrayBuffer());
}
