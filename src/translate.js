import OpenAI from 'openai';
import { config } from './config.js';
import { recordUsage } from './store.js';

export const openai = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM_PROMPT = `You are the translator of a Discord server whose members speak German and Russian.
Detect the language of the user's message:
- German -> translate it into Russian.
- Russian -> translate it into German.
- Any other language, or nothing translatable (only emojis, links, numbers, names, "ok", "lol" ...) -> source "other".
Rules:
- Keep meaning, tone, slang and swearing; write naturally like a native speaker of the target language.
- Keep Discord markdown, mentions (<@...>, <#...>, <@&...>), custom emojis (<:name:id>), URLs and code unchanged.
- Do not translate personal names or gamer tags. Do not add explanations or notes.
- If the message mixes both languages, translate everything into the language that is not dominant.
Reply ONLY with JSON: {"source":"de"|"ru"|"other","translation":"..."}`;

/**
 * Übersetzt Text zwischen Deutsch und Russisch (Richtung wird automatisch erkannt).
 * @returns {Promise<{source:'de'|'ru', target:'de'|'ru', translation:string} | null>}
 *   null, wenn nichts zu übersetzen ist.
 */
export async function translate(text) {
  if (!hasTranslatableContent(text)) return null;

  const res = await openai.chat.completions.create({
    model: config.translateModel,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
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
    return null;
  }
  const source = parsed?.source;
  const translation = typeof parsed?.translation === 'string' ? parsed.translation.trim() : '';
  if ((source !== 'de' && source !== 'ru') || !translation) return null;
  // Modell hat nichts verändert -> keine Übersetzung posten
  if (translation.toLowerCase() === text.trim().toLowerCase()) return null;

  return { source, target: source === 'de' ? 'ru' : 'de', translation };
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
