// Stima dei valori nutrizionali di un piatto con l'AI (Google Gemini): testo da mandare e lettura della risposta.
import type { Nutrients } from '../types';

export interface AiItem {
  name: string;
  grams: number;
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
}

export type AiConfidence = 'alta' | 'media' | 'bassa';

export interface AiMeal {
  dish: string;
  items: AiItem[];
  confidence: AiConfidence;
  note: string;
}

/** Istruzioni per il modello. La descrizione dell'utente va in fondo, separata. */
export function buildPrompt(description: string, hasPhoto: boolean): string {
  const desc = description.trim();
  return [
    'Sei un nutrizionista esperto di cucina italiana. Stima i valori nutrizionali del piatto' +
      (hasPhoto ? ' nella foto' : '') +
      (desc ? ', usando anche la descrizione scritta dall’utente.' : '.'),
    hasPhoto
      ? 'Stima le quantità guardando la grandezza del piatto, delle posate e delle porzioni. Se la descrizione dice quantità precise, usa quelle.'
      : 'Non c’è una foto: se la descrizione non dice le quantità, usa porzioni medie italiane.',
    'Dividi il piatto nei suoi ingredienti principali (massimo 10), compresi olio, burro, condimenti e salse che si vedono o che la ricetta usa normalmente.',
    'Per ogni ingrediente dai i grammi presenti nel piatto e i valori per QUELLA quantità (non per 100 g): kcal, carboidrati, proteine, grassi e fibre in grammi.',
    'Scrivi i nomi in italiano. Se nella foto non c’è cibo, restituisci "items": [].',
    'Rispondi SOLO con JSON valido, senza testo prima o dopo, con questa forma esatta:',
    '{"dish":"nome del piatto","confidence":"alta|media|bassa","note":"una frase breve su cosa è incerto","items":[{"name":"...","grams":0,"kcal":0,"carbs":0,"protein":0,"fat":0,"fiber":0}]}',
    desc ? `Descrizione dell’utente: """${desc.slice(0, 600)}"""` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Toglie eventuali ```json … ``` e testo attorno, e restituisce l'oggetto JSON. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseItem(raw: unknown): AiItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
  const grams = num(o.grams);
  if (!name || grams === null || grams <= 0 || grams > 3000) return null;
  const clamp = (v: unknown, max: number) => Math.min(max, Math.max(0, num(v) ?? 0));
  const carbs = clamp(o.carbs, grams);
  const protein = clamp(o.protein, grams);
  const fat = clamp(o.fat, grams);
  const fiber = clamp(o.fiber, grams);
  let kcal = clamp(o.kcal, grams * 9.5);
  // Se mancano le calorie, si calcolano dai macronutrienti.
  if (kcal === 0 && carbs + protein + fat > 0) kcal = carbs * 4 + protein * 4 + fat * 9 + fiber * 2;
  return { name, grams: Math.round(grams), kcal: Math.round(kcal), carbs: r1(carbs), protein: r1(protein), fat: r1(fat), fiber: r1(fiber) };
}

/** Risposta del modello → piatto con ingredienti (null se la risposta non si capisce). */
export function parseAiMeal(text: string): AiMeal | null {
  const json = extractJson(text);
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  const items = o.items.map(parseItem).filter((x): x is AiItem => x !== null).slice(0, 15);
  const conf = typeof o.confidence === 'string' ? o.confidence.toLowerCase() : '';
  return {
    dish: typeof o.dish === 'string' && o.dish.trim() ? o.dish.trim().slice(0, 80) : 'Piatto',
    items,
    confidence: conf === 'alta' || conf === 'media' || conf === 'bassa' ? conf : 'media',
    note: typeof o.note === 'string' ? o.note.trim().slice(0, 240) : '',
  };
}

/** Lo stesso ingrediente con un'altra quantità (i valori cambiano in proporzione). */
export function scaleItem(item: AiItem, grams: number): AiItem {
  const f = item.grams > 0 ? grams / item.grams : 0;
  return {
    ...item,
    grams,
    kcal: item.kcal * f,
    carbs: item.carbs * f,
    protein: item.protein * f,
    fat: item.fat * f,
    fiber: item.fiber * f,
  };
}

/** Valori per 100 g, come per gli altri alimenti del diario. */
export function itemPer100(item: AiItem): Nutrients {
  const f = item.grams > 0 ? 100 / item.grams : 0;
  return {
    kcal: r1(item.kcal * f),
    carbs: r1(item.carbs * f),
    protein: r1(item.protein * f),
    fat: r1(item.fat * f),
    fiber: r1(item.fiber * f),
  };
}

// ---------- Risposta dell'API di Gemini ----------

/** Testo della risposta (senza le parti di "ragionamento"). */
export function geminiText(json: unknown): string {
  const c = (json as { candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] } }[] })?.candidates?.[0];
  const parts = c?.content?.parts ?? [];
  return parts
    .filter((p) => typeof p.text === 'string' && p.thought !== true)
    .map((p) => p.text as string)
    .join('');
}

export type GeminiProblem = 'key' | 'quota' | 'model' | 'blocked' | 'region' | 'other';

/** Che tipo di errore ha restituito Gemini. */
export function geminiProblem(status: number, json: unknown): GeminiProblem {
  const err = (json as { error?: { message?: unknown; status?: unknown; details?: { reason?: unknown }[] } })?.error;
  const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
  const reasons = (err?.details ?? []).map((d) => String(d?.reason ?? '')).join(' ');
  if (status === 429) return 'quota';
  if (/API_KEY_INVALID|API_KEY_EXPIRED/.test(reasons) || message.includes('api key')) return 'key';
  if (status === 401 || status === 403) return message.includes('location') || message.includes('region') ? 'region' : 'key';
  if (status === 404) return 'model';
  if (message.includes('location is not supported') || message.includes('user location')) return 'region';
  const block = (json as { promptFeedback?: { blockReason?: unknown } })?.promptFeedback?.blockReason;
  if (block) return 'blocked';
  return 'other';
}

export function problemMessage(p: GeminiProblem): string {
  switch (p) {
    case 'key':
      return 'Gemini non accetta la chiave. Ricopiala tutta da aistudio.google.com/apikey e incollala di nuovo nel Profilo.';
    case 'quota':
      return 'Hai raggiunto il limite gratuito di Gemini per adesso. Riprova tra qualche minuto o domani.';
    case 'region':
      return 'Gemini non è disponibile da dove ti trovi in questo momento.';
    case 'blocked':
      return 'Gemini non ha voluto analizzare questa foto. Prova con un’altra o con una descrizione.';
    case 'model':
      return 'Il modello di Gemini non è disponibile. Aggiorna l’app o riprova più tardi.';
    default:
      return 'Gemini non ha risposto. Riprova tra poco.';
  }
}

/** Le chiavi di Google AI Studio iniziano con "AQ." (nuove, da maggio 2026) o "AIza" (vecchie). */
export function looksLikeGeminiKey(key: string): boolean {
  const k = key.trim();
  return /^AIza[0-9A-Za-z_-]{30,}$/.test(k) || /^AQ\.[0-9A-Za-z_.-]{20,}$/.test(k);
}
