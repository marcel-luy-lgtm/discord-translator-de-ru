// Einfache JSON-Datei als Speicher für Server-Einstellungen und Nutzungsstatistik.
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve('data', 'store.json');

let state = { guilds: {}, usage: {}, settings: {} };
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
} catch (err) {
  if (err.code !== 'ENOENT') console.warn('store.json konnte nicht gelesen werden:', err.message);
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  }, 1000);
}

function guild(guildId) {
  state.guilds[guildId] ??= { channels: [] };
  return state.guilds[guildId];
}

export function isTranslateChannel(guildId, channelId) {
  return state.guilds[guildId]?.channels.includes(channelId) ?? false;
}

export function addTranslateChannel(guildId, channelId) {
  const g = guild(guildId);
  if (g.channels.includes(channelId)) return false;
  g.channels.push(channelId);
  scheduleSave();
  return true;
}

export function removeTranslateChannel(guildId, channelId) {
  const g = guild(guildId);
  const before = g.channels.length;
  g.channels = g.channels.filter((id) => id !== channelId);
  scheduleSave();
  return g.channels.length !== before;
}

export function listTranslateChannels(guildId) {
  return [...(state.guilds[guildId]?.channels ?? [])];
}

// --- Nutzungsstatistik (global, pro Monat und Tag) ---

const monthKey = () => new Date().toISOString().slice(0, 7);
const dayKey = () => new Date().toISOString().slice(0, 10);

function bucket(key) {
  state.usage[key] ??= { messages: 0, inputTokens: 0, outputTokens: 0, sttSeconds: 0, ttsChars: 0 };
  return state.usage[key];
}

export function recordUsage(delta) {
  for (const key of [monthKey(), dayKey()]) {
    const b = bucket(key);
    for (const [k, v] of Object.entries(delta)) b[k] = (b[k] ?? 0) + v;
  }
  scheduleSave();
}

export function getUsage() {
  return { month: bucket(monthKey()), day: bucket(dayKey()), monthKey: monthKey(), dayKey: dayKey() };
}

// --- Bot-weite Einstellungen (z. B. Kostensperre) ---

export function getSetting(key) {
  return state.settings[key];
}

export function setSetting(key, value) {
  if (value === undefined || value === null) delete state.settings[key];
  else state.settings[key] = value;
  scheduleSave();
}
