// Eine VoiceSession pro Server: hört im Voice-Channel zu, übersetzt jede Äußerung
// und gibt sie je nach Modus als Text (im Chat des Voice-Channels) und/oder als Sprache aus.
import { Readable } from 'node:stream';
import {
  AudioPlayerStatus,
  EndBehaviorType,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import prism from 'prism-media';
import { config } from './config.js';
import { FLAGS, translate } from './translate.js';
import { SAMPLE_RATE, rms, stereoToMono, synthesize, transcribe } from './audio.js';
import { getUsage } from './store.js';

export const MODES = {
  text: 'Nur Text',
  audio: 'Nur Audio',
  both: 'Text + Audio',
};

const SILENCE_MS = 900; // Pause, nach der eine Äußerung als beendet gilt
const MIN_SECONDS = 0.6; // kürzere Geräusche werden ignoriert
const MAX_SECONDS = 30; // längere Monologe werden in Stücke geteilt
const MIN_RMS = 0.01; // sehr leise Aufnahmen (Rauschen) ignorieren

/** guildId -> VoiceSession */
export const sessions = new Map();

export class VoiceSession {
  constructor(channel, mode) {
    this.channel = channel;
    this.guild = channel.guild;
    this.mode = mode;
    this.listening = new Set();
    this.outputChain = Promise.resolve();
    this.audioQueue = [];
    this.limitWarned = false;
    this.destroyed = false;
  }

  async start() {
    this.connection = joinVoiceChannel({
      channelId: this.channel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Kanalwechsel/kurzer Verbindungsabbruch: Discord verbindet sich selbst neu
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });
    this.connection.on(VoiceConnectionStatus.Destroyed, () => this.destroy());
    this.connection.on('error', (err) => console.error('[voice] Verbindungsfehler:', err));

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      this.destroy();
      throw err;
    }

    this.player = createAudioPlayer();
    this.player.on(AudioPlayerStatus.Idle, () => this.playNext());
    this.player.on('error', (err) => {
      console.error('[voice] Wiedergabefehler:', err.message);
      this.playNext();
    });
    this.connection.subscribe(this.player);

    this.connection.receiver.speaking.on('start', (userId) => this.listen(userId));
  }

  listen(userId) {
    if (this.destroyed || this.listening.has(userId)) return;
    const user = this.guild.client.users.cache.get(userId);
    if (user?.bot) return;
    this.listening.add(userId);

    const opusStream = this.connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_MS },
    });
    const decoder = new prism.opus.Decoder({ rate: SAMPLE_RATE, channels: 2, frameSize: 960 });
    const maxBytes = MAX_SECONDS * SAMPLE_RATE * 4;
    const chunks = [];
    let bytes = 0;
    let done = false;

    const finish = (cut = false) => {
      if (done) return;
      done = true;
      this.listening.delete(userId);
      opusStream.unpipe(decoder);
      decoder.destroy();
      if (!opusStream.destroyed) opusStream.destroy();
      if (bytes) this.handleUtterance(userId, Buffer.concat(chunks));
      // Wer ohne Pause weiterredet, löst kein neues "speaking start" aus -> direkt weiter zuhören
      if (cut && this.connection.receiver.speaking.users.has(userId)) setImmediate(() => this.listen(userId));
    };

    decoder.on('data', (chunk) => {
      chunks.push(chunk);
      bytes += chunk.length;
      if (bytes >= maxBytes) finish(true); // Stück abschließen; weiteres Sprechen startet ein neues
    });
    decoder.on('error', (err) => {
      console.warn('[voice] Decoder-Fehler:', err.message);
      finish();
    });
    opusStream.on('end', () => finish());
    opusStream.on('close', () => finish());
    opusStream.on('error', () => finish());
    opusStream.pipe(decoder);
  }

  handleUtterance(userId, stereoPcm) {
    const mono = stereoToMono(stereoPcm);
    const seconds = mono.length / 2 / SAMPLE_RATE;
    if (seconds < MIN_SECONDS || rms(mono) < MIN_RMS) return;

    if (config.voiceDailyMinuteLimit > 0) {
      const usedMinutes = getUsage().day.sttSeconds / 60;
      if (usedMinutes >= config.voiceDailyMinuteLimit) {
        if (!this.limitWarned) {
          this.limitWarned = true;
          this.sendText(
            `⚠️ Tageslimit für Sprachübersetzung erreicht (${config.voiceDailyMinuteLimit} Min.). ` +
              `Лимит голосового перевода на сегодня исчерпан.`,
          ).catch(() => {});
        }
        return;
      }
    }

    // Verarbeitung startet sofort (parallel), ausgegeben wird aber in Sprechreihenfolge.
    const result = this.processUtterance(userId, mono).catch((err) => {
      console.error('[voice] Übersetzung fehlgeschlagen:', err.message);
      return null;
    });
    this.outputChain = this.outputChain.then(async () => {
      const r = await result;
      if (r && !this.destroyed) await this.output(r).catch((err) => console.error('[voice] Ausgabe:', err.message));
    });
  }

  async processUtterance(userId, mono) {
    const original = await transcribe(mono);
    if (!original) return null;
    const translated = await translate(original);
    if (!translated) return null;

    const member = await this.guild.members.fetch(userId).catch(() => null);
    const name = member?.displayName ?? 'Unbekannt';
    const audio = this.mode === 'text' ? null : await synthesize(translated.translation, translated.target);
    return { name, original, ...translated, audio };
  }

  async output({ name, original, source, target, translation, audio }) {
    if (this.mode !== 'audio') {
      const quote = original.length > 300 ? `${original.slice(0, 300)}…` : original;
      await this.sendText(`**${name}** ${FLAGS[source]}→${FLAGS[target]} ${translation}\n-# ${quote}`);
    }
    if (audio && this.mode !== 'text') {
      this.audioQueue.push(audio);
      if (this.player.state.status === AudioPlayerStatus.Idle) this.playNext();
    }
  }

  playNext() {
    if (this.destroyed) return;
    const next = this.audioQueue.shift();
    if (!next) return;
    this.player.play(createAudioResource(Readable.from(next), { inputType: StreamType.OggOpus }));
  }

  sendText(content) {
    // Voice-Channels haben einen eigenen Text-Chat – dort landen die Übersetzungen.
    return this.channel.send({ content: content.slice(0, 2000), allowedMentions: { parse: [] } });
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'text') {
      this.audioQueue.length = 0;
      this.player?.stop();
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.audioQueue.length = 0;
    this.player?.stop(true);
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }
    if (sessions.get(this.guild.id) === this) sessions.delete(this.guild.id);
  }
}
