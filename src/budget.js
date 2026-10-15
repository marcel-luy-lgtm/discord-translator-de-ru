// Kostensperre: schätzt die API-Kosten anhand der Nutzung und blockiert weitere
// Anfragen, sobald das Tages- oder Monatsbudget erreicht ist.
import { config } from './config.js';
import { getSetting, getUsage, setSetting } from './store.js';

// Richtwerte in USD (Stand 2026, bitte bei OpenAI prüfen). Über .env anpassbar.
const PRICES = {
  inputPerMTok: Number(process.env.PRICE_INPUT_PER_MTOK) || 0.15,
  outputPerMTok: Number(process.env.PRICE_OUTPUT_PER_MTOK) || 0.6,
  sttPerMinute: Number(process.env.PRICE_STT_PER_MINUTE) || 0.003,
  ttsPerMChars: Number(process.env.PRICE_TTS_PER_MCHARS) || 12,
};

export function estimate(u) {
  const text = (u.inputTokens * PRICES.inputPerMTok + u.outputTokens * PRICES.outputPerMTok) / 1e6;
  const stt = (u.sttSeconds / 60) * PRICES.sttPerMinute;
  const tts = (u.ttsChars * PRICES.ttsPerMChars) / 1e6;
  return { text, stt, tts, total: text + stt + tts };
}

/** Per Befehl gesetzte Limits haben Vorrang vor der .env. 0 = kein Limit. */
export function getLimits() {
  return {
    daily: getSetting('dailyBudgetUsd') ?? config.dailyBudgetUsd,
    monthly: getSetting('monthlyBudgetUsd') ?? config.monthlyBudgetUsd,
  };
}

export function setLimits({ daily, monthly }) {
  if (daily !== undefined) setSetting('dailyBudgetUsd', daily);
  if (monthly !== undefined) setSetting('monthlyBudgetUsd', monthly);
}

/**
 * Prüft, ob noch Budget übrig ist.
 * @returns {{blocked:false} | {blocked:true, period:'day'|'month', key:string, limit:number, spent:number}}
 */
export function checkBudget() {
  const { day, month, dayKey, monthKey } = getUsage();
  const limits = getLimits();
  const daySpent = estimate(day).total;
  const monthSpent = estimate(month).total;
  if (limits.monthly > 0 && monthSpent >= limits.monthly) {
    return { blocked: true, period: 'month', key: monthKey, limit: limits.monthly, spent: monthSpent };
  }
  if (limits.daily > 0 && daySpent >= limits.daily) {
    return { blocked: true, period: 'day', key: dayKey, limit: limits.daily, spent: daySpent };
  }
  return { blocked: false };
}

export const isBudgetExceeded = () => checkBudget().blocked;

// Hinweis nur einmal pro Channel und Zeitraum posten, nicht bei jeder Nachricht.
const notified = new Set();

/** Liefert den Sperr-Hinweis, falls er in diesem Channel noch nicht gezeigt wurde. */
export function budgetNotice(channelId) {
  const status = checkBudget();
  if (!status.blocked) return null;
  const id = `${status.key}:${channelId}`;
  if (notified.has(id)) return null;
  notified.add(id);
  return status.period === 'month'
    ? `⛔ Monatsbudget für Übersetzungen erreicht ($${status.limit.toFixed(2)}). Übersetzung pausiert bis Monatsende.\n` +
        `⛔ Месячный бюджет на перевод исчерпан. Перевод приостановлен до конца месяца.`
    : `⛔ Tagesbudget für Übersetzungen erreicht ($${status.limit.toFixed(2)}). Morgen geht es weiter.\n` +
        `⛔ Дневной бюджет на перевод исчерпан. Перевод возобновится завтра.`;
}
