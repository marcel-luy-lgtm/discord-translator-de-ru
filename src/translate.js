import OpenAI from 'openai';
import { config } from './config.js';
import { recordUsage } from './store.js';
import { isBudgetExceeded } from './budget.js';

export const openai = new OpenAI({ apiKey: config.openaiApiKey });

const RULES = `Rules:
- Keep meaning, tone, slang and swearing; write naturally like a native speaker of the target language.
- Translate short replies too ("да" -> "ja", "спс" -> "danke", "ok" stays "ok").
- Keep Discord markdown, mentions (<@...>, <#...>, <@&...>), custom emojis (<:name:id>), emojis, URLs and code unchanged.
- Do not translate personal names or gamer tags. Do not add explanations, notes or quotes.
- Earlier chat messages may be given as context. Use them ONLY to understand the situation and choose the right meaning of ambiguous words (e.g. "хозяйка" in a household context = "Hausfrau", not "Herrin"). Translate ONLY the message to translate.`;

// Kyrillische Nachricht: Richtung steht fest (Russisch -> Deutsch), das Modell muss nichts entscheiden.
const PROMPT_RU_TO_DE = `You translate chat messages of a Discord server from Russian into German.
The message is written in Cyrillic (Russian, possibly with slang, typos or a few Ukrainian words). Always translate it into German.
${RULES}
Reply ONLY with JSON: {"translation":"..."}`;

// Lateinische Schrift: Deutsch, transliteriertes Russisch ("privet, kak dela") oder etwas anderes.
const PROMPT_LATIN = `You translate chat messages of a Discord server whose members speak German and Russian.
The message is written in Latin letters. Decide what it is:
- German -> translate into Russian (Cyrillic). source "de".
- Russian written in Latin letters / transliteration (e.g. "privet, kak dela?", "spasibo", "davai") -> translate into German. source "ru".
- Another language (e.g. English) or nothing translatable (only names, "ok", "lol", "xD", numbers) -> source "other", translation "".
${RULES}
Reply ONLY with JSON: {"source":"de"|"ru"|"other","translation":"..."}`;

/**
 * Übersetzt Text zwischen Deutsch und Russisch (Richtung wird automatisch erkannt).
 * @param {string[]} [context] vorherige Nachrichten ("Name: Text"), nur als Verständnishilfe
 * @returns {Promise<{source:'de'|'ru', target:'de'|'ru', translation:string} | null>}
 *   null, wenn nichts zu übersetzen ist.
 */
export async function translate(text, context = []) {
  if (!hasTranslatableContent(text)) return skip('kein übersetzbarer Text', text);
  if (isBudgetExceeded()) return null;

  const cyrillic = isMostlyCyrillic(text);
  const res = await openai.chat.completions.create({
    model: config.translateModel,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: cyrillic ? PROMPT_RU_TO_DE : PROMPT_LATIN },
      { role: 'user', content: buildUserMessage(text, context) },
    ],
  });

  recordUsage({
    messages: 1,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  });

  let parsed;
  try {
    parsed = JSON.parse(res.choices[0]?.message?.content ?? '');
  } catch {
    return skip('ungültige Modell-Antwort', text);
  }
  const source = cyrillic ? 'ru' : parsed?.source;
  const translation = typeof parsed?.translation === 'string' ? parsed.translation.trim() : '';
  if (source !== 'de' && source !== 'ru') return skip('weder Deutsch noch Russisch', text);
  if (!translation) return skip('leere Übersetzung', text);
  // Modell hat nichts verändert -> keine Übersetzung posten
  if (translation.toLowerCase() === text.trim().toLowerCase()) return skip('Übersetzung identisch mit Original', text);

  return { source, target: source === 'de' ? 'ru' : 'de', translation };
}

function buildUserMessage(text, context) {
  if (!context.length) return text;
  return (
    `Earlier messages in this chat (context only, do NOT translate):\n${context.join('\n')}\n\n` +
    `Message to translate:\n${text}`
  );
}

/** Überwiegend kyrillische Buchstaben -> Russisch. */
export function isMostlyCyrillic(text) {
  const cyr = (text.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const lat = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  return cyr > 0 && cyr >= lat;
}

// Im Log steht nur der Grund und die Länge, nicht der Nachrichteninhalt.
function skip(reason, text) {
  console.log(`[translate] übersprungen (${reason}), ${text.length} Zeichen`);
  return null;
}

/** Grober Vorfilter, damit z. B. reine Emojis/Links keine API-Kosten erzeugen. */
export function hasTranslatableContent(text) {
  const stripped = text
    .replace(/<a?:\w+:\d+>/g, ' ') // Custom-Emojis
    .replace(/<(@[!&]?|#)\d+>/g, ' ') // Erwähnungen
    .replace(/https?:\/\/\S+/g, ' ') // Links
    .replace(/```[\s\S]*?```|`[^`]*`/g, ' '); // Code
  const letters = stripped.match(/[\p{L}]/gu) ?? [];
  return letters.length >= 2;
}

export const FLAGS = { de: '🇩🇪', ru: '🇷🇺' };
