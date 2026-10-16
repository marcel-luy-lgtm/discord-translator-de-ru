// Merkt sich die letzten Nachrichten pro Channel (nur im Arbeitsspeicher), damit die
// Übersetzung den Gesprächszusammenhang kennt (z. B. "хозяйка" = Hausfrau statt Herrin).

const MAX_PER_CHANNEL = 8;
const MAX_AGE_MS = 15 * 60 * 1000; // ältere Nachrichten gehören meist nicht mehr zum Thema
const MAX_CHARS = 300; // pro Nachricht, damit der Kontext günstig bleibt

/** channelId -> [{ id, author, text, ts }] */
const recent = new Map();

export function rememberMessage(channelId, { id, author, text, ts = Date.now() }) {
  const list = recent.get(channelId) ?? [];
  list.push({ id, author, text: text.slice(0, MAX_CHARS), ts });
  if (list.length > MAX_PER_CHANNEL) list.splice(0, list.length - MAX_PER_CHANNEL);
  recent.set(channelId, list);
}

/**
 * Kontextzeilen ("Name: Text") für die nächste Übersetzung.
 * @param {object} [repliedTo] Nachricht, auf die geantwortet wird (auch wenn sie älter ist)
 */
export function getContext(channelId, { limit = 5, repliedTo } = {}) {
  const now = Date.now();
  const lines = (recent.get(channelId) ?? [])
    .filter((m) => now - m.ts <= MAX_AGE_MS)
    .slice(-limit);
  if (repliedTo?.text && !lines.some((m) => m.id === repliedTo.id)) {
    lines.unshift({ ...repliedTo, text: repliedTo.text.slice(0, MAX_CHARS), replied: true });
  }
  return lines.map((m) => `${m.replied ? '(Antwort auf) ' : ''}${m.author}: ${m.text}`);
}
