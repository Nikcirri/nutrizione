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
export type AiPortion = 'piccola' | 'normale' | 'abbondante';

/** Risposta pronta a una domanda: moltiplica le calorie del piatto e/o aggiunge un ingrediente. */
export interface AiOption {
  label: string;
  factor: number;
  add: AiItem | null;
}

export interface AiQuestion {
  question: string;
  options: AiOption[];
}

export interface AiMeal {
  dish: string;
  items: AiItem[];
  confidence: AiConfidence;
  note: string;
  portion: AiPortion;
  /** Una frase semplice su da dove vengono le calorie. */
  why: string;
  /** Domande su ciò che dalla foto non si vede (al massimo 2). */
  questions: AiQuestion[];
}

export interface PromptContext {
  /** Abitudini imparate dalle correzioni (frasi già pronte). */
  habits?: string[];
  /** Piatti che l'utente mangia spesso. */
  knownDishes?: string[];
}

/** Istruzioni per il modello. La descrizione dell'utente va in fondo, separata. */
export function buildPrompt(description: string, hasPhoto: boolean, context: PromptContext = {}): string {
  const desc = description.trim();
  const habits = (context.habits ?? []).filter(Boolean);
  const dishes = (context.knownDishes ?? []).filter(Boolean).slice(0, 15);
  return [
    'Sei un nutrizionista esperto di cucina italiana. Stima i valori nutrizionali del piatto' +
      (hasPhoto ? ' nella foto' : '') +
      (desc ? ', usando anche la descrizione scritta dall’utente.' : '.'),
    hasPhoto
      ? 'Stima le quantità guardando la grandezza del piatto, delle posate e delle porzioni. Se la descrizione dice quantità precise, usa quelle.'
      : 'Non c’è una foto: se la descrizione non dice le quantità, usa porzioni medie italiane.',
    'Dividi il piatto nei suoi ingredienti principali (massimo 10), compresi olio, burro, condimenti e salse che si vedono o che la ricetta usa normalmente.',
    'Per ogni ingrediente dai i grammi presenti nel piatto e i valori per QUELLA quantità (non per 100 g): kcal, carboidrati, proteine, grassi e fibre in grammi.',
    'Scrivi i nomi in italiano.',
    hasPhoto && desc
      ? 'La descrizione dell’utente ha la precedenza: anche se la foto è scura, sfocata o non si capisce, stima sempre il cibo descritto.'
      : hasPhoto
        ? 'Se la foto è scura o sfocata, stima comunque il cibo più probabile con "confidence": "bassa". Restituisci "items": [] solo se nella foto non c’è proprio niente da mangiare o da bere.'
        : 'Restituisci "items": [] solo se la descrizione non parla di cibo o bevande.',
    'L’utente non conosce i valori nutrizionali: in "why" spiega in una frase semplice da dove arriva la maggior parte delle calorie (es. "Quasi metà arriva dall’olio e dal formaggio").',
    'In "portion" di’ se la porzione è piccola, normale o abbondante rispetto a una porzione italiana normale.',
    'Fai al massimo 2 domande, SOLO su cose che non si vedono e che cambiano molto le calorie (es. fritto o al forno, caffè zuccherato o no, condimento con panna o no). Ogni domanda ha 2 o 3 risposte brevi: la prima è quella che hai già usato nella stima (factor 1, senza "add"); per le altre indica "factor" (per quanto moltiplicare tutte le calorie del piatto) oppure "add" (un ingrediente da aggiungere, con grammi e valori). Se non serve nessuna domanda: "questions": [].',
    habits.length ? `Abitudini di questo utente: ${habits.join(' ')}` : '',
    dishes.length ? `Piatti che l’utente mangia spesso (se il piatto è uno di questi, usa esattamente lo stesso nome): ${dishes.join('; ')}.` : '',
    'Rispondi SOLO con JSON valido, senza testo prima o dopo, con questa forma esatta:',
    '{"dish":"nome del piatto","portion":"piccola|normale|abbondante","confidence":"alta|media|bassa","items":[{"name":"...","grams":120,"kcal":0,"carbs":0,"protein":0,"fat":0,"fiber":0}],"why":"…","note":"una frase breve su cosa è incerto","questions":[{"question":"...","options":[{"label":"...","factor":1}]}]}',
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

const NUMBER = { type: 'number' } as const;

const ITEM_SCHEMA = {
  type: 'object',
  properties: { name: { type: 'string' }, grams: NUMBER, kcal: NUMBER, carbs: NUMBER, protein: NUMBER, fat: NUMBER, fiber: NUMBER },
  required: ['name', 'grams', 'kcal', 'carbs', 'protein', 'fat', 'fiber'],
} as const;

/**
 * Forma della risposta per gli "structured outputs" di Gemini: il modello è obbligato a rispondere
 * con JSON valido e completo. Gli ingredienti vengono prima delle frasi.
 */
export const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    dish: { type: 'string' },
    portion: { type: 'string', enum: ['piccola', 'normale', 'abbondante'] },
    confidence: { type: 'string', enum: ['alta', 'media', 'bassa'] },
    items: { type: 'array', items: ITEM_SCHEMA, maxItems: 12 },
    why: { type: 'string' },
    note: { type: 'string' },
    questions: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 3,
            items: { type: 'object', properties: { label: { type: 'string' }, factor: NUMBER, add: ITEM_SCHEMA }, required: ['label', 'factor'] },
          },
        },
        required: ['question', 'options'],
      },
    },
  },
  required: ['dish', 'portion', 'confidence', 'items', 'why', 'note', 'questions'],
} as const;

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
  const portion = typeof o.portion === 'string' ? o.portion.toLowerCase() : '';
  return {
    dish: typeof o.dish === 'string' && o.dish.trim() ? o.dish.trim().slice(0, 80) : 'Piatto',
    items,
    confidence: conf === 'alta' || conf === 'media' || conf === 'bassa' ? conf : 'media',
    note: typeof o.note === 'string' ? o.note.trim().slice(0, 240) : '',
    portion: portion === 'piccola' || portion === 'abbondante' ? portion : 'normale',
    why: typeof o.why === 'string' ? o.why.trim().slice(0, 200) : '',
    questions: Array.isArray(o.questions) ? o.questions.map(parseQuestion).filter((q): q is AiQuestion => q !== null).slice(0, 2) : [],
  };
}

function parseQuestion(raw: unknown): AiQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const question = typeof o.question === 'string' ? o.question.trim().slice(0, 120) : '';
  if (!question || !Array.isArray(o.options)) return null;
  const options = o.options
    .map((x): AiOption | null => {
      if (typeof x !== 'object' || x === null) return null;
      const op = x as Record<string, unknown>;
      const label = typeof op.label === 'string' ? op.label.trim().slice(0, 40) : '';
      if (!label) return null;
      const f = num(op.factor);
      return { label, factor: f === null ? 1 : Math.min(3, Math.max(0.3, f)), add: parseItem(op.add) };
    })
    .filter((x): x is AiOption => x !== null)
    .slice(0, 3);
  return options.length >= 2 ? { question, options } : null;
}

// ---------- Correzioni con i pulsanti ----------

const DRESSING = /olio|burro|margarin|maionese|panna|condiment|sugo|salsa|rag[uù]|pesto|formagg|parmigian|grana|pecorino|mozzarell|guanciale|pancetta|lardo|strutto|besciamella|zucchero|miele|crema|nutella|ketchup/i;

/** Condimenti e ingredienti "grassi": quelli che cambiano con "più/meno condito". */
export function isDressing(item: Pick<AiItem, 'name' | 'kcal' | 'fat'>): boolean {
  return DRESSING.test(item.name) || (item.kcal > 0 && (item.fat * 9) / item.kcal > 0.7);
}

export function totalKcal(items: AiItem[]): number {
  return items.reduce((a, i) => a + i.kcal, 0);
}

/** Oltre questa soglia un piatto è sospetto (forse era da dividere). */
export const SUSPICIOUS_KCAL = 1500;

/** Perché tante calorie: se l'AI non lo ha detto, si guarda l'ingrediente che pesa di più. */
export function whyText(meal: Pick<AiMeal, 'why'>, items: AiItem[]): string {
  if (meal.why) return meal.why;
  const total = totalKcal(items);
  const top = [...items].sort((a, b) => b.kcal - a.kcal)[0];
  if (!top || total <= 0) return '';
  const share = Math.round((top.kcal / total) * 100);
  return `La parte più calorica è ${top.name.toLowerCase()} (circa ${share}% del piatto).`;
}

export interface AiHabits {
  lessDressing: number;
  moreDressing: number;
  smaller: number;
  bigger: number;
}

export const NO_HABITS: AiHabits = { lessDressing: 0, moreDressing: 0, smaller: 0, bigger: 0 };

/** Abitudini imparate dalle correzioni, in frasi da dare all'AI. */
export function habitsHints(h: AiHabits): string[] {
  const out: string[] = [];
  if (h.lessDressing - h.moreDressing >= 2) out.push('Di solito condisce poco: stima olio e condimenti scarsi.');
  if (h.moreDressing - h.lessDressing >= 2) out.push('Di solito condisce molto: stima olio e condimenti generosi.');
  if (h.smaller - h.bigger >= 2) out.push('Di solito mangia porzioni più piccole della media.');
  if (h.bigger - h.smaller >= 2) out.push('Di solito mangia porzioni più grandi della media.');
  return out;
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

/** Ordine dei modelli da provare: quello che ha funzionato l'ultima volta va per primo. */
/** Per ogni modello, fino a quando non usarlo (millisecondi), dopo un limite raggiunto o se non esiste. */
export type ModelPauses = Record<string, number>;

/**
 * Modelli da provare adesso, sempre dal migliore: si saltano quelli in pausa.
 * Se sono tutti in pausa si provano comunque, nello stesso ordine.
 */
export function modelsToTry(models: readonly string[], pauses: ModelPauses, now: number): string[] {
  const ready = models.filter((m) => !((pauses[m] ?? 0) > now));
  return ready.length ? ready : [...models];
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Millisecondi fino alla prossima mezzanotte di Los Angeles (quando Google azzera i limiti giornalieri). */
export function msToPacificMidnight(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000;
  return Math.max(MINUTE, DAY - elapsed + MINUTE);
}

/**
 * Fino a quando mettere in pausa un modello dopo una risposta di errore (null = nessuna pausa).
 * Limite giornaliero: fino alla mezzanotte di Los Angeles. Limite al minuto: il tempo indicato da Google
 * (almeno 30 secondi). Modello inesistente: una settimana.
 */
export function pauseUntil(status: number, json: unknown, now: number): number | null {
  const problem = geminiProblem(status, json);
  if (problem === 'model') return now + 7 * DAY;
  if (problem !== 'quota') return null;
  const details = (json as { error?: { details?: Record<string, unknown>[] } })?.error?.details ?? [];
  const text = JSON.stringify(details);
  if (/PerDay/i.test(text)) return now + msToPacificMidnight(now);
  const delay = details.map((d) => (typeof d.retryDelay === 'string' ? parseFloat(d.retryDelay) : NaN)).find((n) => Number.isFinite(n));
  return now + Math.min(10 * MINUTE, Math.max(30_000, (delay ?? 60) * 1000));
}

/** Com'è andato un tentativo con un modello (per spiegare all'utente cosa non ha funzionato). */
export type AttemptOutcome = 'ok' | 'empty' | 'unreadable' | 'quota' | 'model' | 'error' | 'timeout' | 'network' | 'slower';

export interface AiAttempt {
  model: string;
  outcome: AttemptOutcome;
}

/** "gemini-3.5-flash-lite" → "3.5 Flash-Lite". */
export function modelLabel(model: string): string {
  return model
    .replace(/^gemini-/, '')
    .split('-')
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace('Flash Lite', 'Flash-Lite');
}

const OUTCOME_TEXT: Record<AttemptOutcome, string> = {
  ok: 'ok',
  empty: 'nessun cibo riconosciuto',
  unreadable: 'risposta non leggibile',
  quota: 'limite gratuito raggiunto',
  model: 'non disponibile',
  error: 'errore',
  timeout: 'nessuna risposta in tempo',
  network: 'nessuna connessione',
  slower: 'più lento di un altro',
};

// ---------- Più modelli a scaglioni ----------
//
// Con una foto i modelli Flash a volte ci mettono più di 45 secondi, il Flash-Lite una decina. Aspettarli
// uno dopo l'altro voleva dire minuti. Ora si parte dal migliore e, se tarda, si avvia anche il successivo:
// vince la prima risposta buona, ma un modello migliore ancora in corsa ha qualche secondo di vantaggio.

/** Dopo quanto, senza risposta, si avvia anche il modello successivo. */
export const STAGGER_MS = 8_000;
/** Con una risposta buona di un modello più leggero, quanto si aspetta ancora quelli migliori. */
export const GRACE_MS = 6_000;
/** Tempo massimo per tutta l'analisi. */
export const OVERALL_MS = 75_000;

/** Come è finita la richiesta a un modello: null = ancora in corso. */
export type RaceKind = 'ok' | 'empty' | 'fail' | 'stop';

export interface RaceState {
  /** Un elemento per modello avviato, in ordine dal migliore. */
  results: readonly (RaceKind | null)[];
  /** Modelli disponibili in tutto. */
  total: number;
  /** Il modello avviato per ultimo è stato lento con le foto di recente: il successivo parte subito. */
  lastIsSlow: boolean;
  sinceLastStart: number;
  /** Da quanto è arrivata la prima risposta buona (null = nessuna). */
  sinceFirstOk: number | null;
  elapsed: number;
}

export type RaceAction = { type: 'start' } | { type: 'wait' } | { type: 'use'; index: number } | { type: 'stop'; index: number } | { type: 'finish' };

/** Cosa fare adesso nella gara tra i modelli (funzione pura, vedi `analyzeMeal`). */
export function raceStep(s: RaceState): RaceAction {
  const stop = s.results.indexOf('stop');
  if (stop >= 0) return { type: 'stop', index: stop };
  const ok = s.results.indexOf('ok');
  if (ok >= 0) {
    const betterPending = s.results.slice(0, ok).some((r) => r === null);
    if (!betterPending || (s.sinceFirstOk ?? 0) >= GRACE_MS || s.elapsed >= OVERALL_MS) return { type: 'use', index: ok };
    return { type: 'wait' };
  }
  const pending = s.results.filter((r) => r === null).length;
  const canStart = s.results.length < s.total && s.elapsed < OVERALL_MS;
  if (canStart && (pending === 0 || s.lastIsSlow || s.sinceLastStart >= STAGGER_MS)) return { type: 'start' };
  if (pending === 0 || s.elapsed >= OVERALL_MS) return { type: 'finish' };
  return { type: 'wait' };
}

/** Modelli lenti con le foto: modello → fino a quando (millisecondi). */
export type SlowModels = Record<string, number>;
/** Per quanto un modello lento con le foto non ha più il vantaggio di partire da solo. */
export const SLOW_FOR_MS = 24 * 60 * 60 * 1000;

/** Riga breve con i tentativi fatti, es. "3.8 Flash: limite gratuito raggiunto · 3.6 Flash: nessun cibo riconosciuto". */
export function describeAttempts(attempts: AiAttempt[]): string {
  return attempts.map((a) => `${modelLabel(a.model)}: ${OUTCOME_TEXT[a.outcome]}`).join(' · ');
}

/**
 * Controllo veloce di una foto rimpicciolita (pixel RGBA): vero se è praticamente tutta nera
 * o tutta di un colore, cioè se la fotocamera non ha dato un'immagine vera.
 */
export function looksBlank(rgba: ArrayLike<number>): boolean {
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    const y = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
    sum += y;
    sumSq += y * y;
    n++;
  }
  if (!n) return true;
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  return sd < 2.5 || (mean < 10 && sd < 6);
}

/** Messaggio durante l'attesa, in base ai secondi passati. */
export function waitingMessage(seconds: number, hasPhoto: boolean): string {
  if (seconds < 3) return hasPhoto ? 'Invio la foto…' : 'Invio la descrizione…';
  if (seconds < 8) return hasPhoto ? 'Riconosco il cibo…' : 'Leggo la descrizione…';
  if (seconds < 20) return 'Calcolo grammi e valori…';
  return 'Ci vuole più del solito, ancora un momento…';
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

export type GeminiProblem = 'key' | 'quota' | 'model' | 'blocked' | 'region' | 'timeout' | 'network' | 'other';

/**
 * Vero se la richiesta è caduta perché Gemini non ha risposto in tempo (e non perché manca la rete).
 * Sul telefono l'errore arriva da Android ("timeout", "Read timed out"), nel browser è un AbortError.
 */
export function isTimeoutError(e: unknown): boolean {
  const err = e as { name?: unknown; message?: unknown } | null;
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return true;
  const message = typeof err?.message === 'string' ? err.message : typeof e === 'string' ? e : '';
  return /time[ds]?[ -]?out/i.test(message);
}

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
    case 'timeout':
      return 'Gemini non ha risposto in tempo. Riprova tra poco: di solito la seconda volta va.';
    case 'network':
      return 'Non riesco a contattare Gemini. Controlla la connessione e riprova.';
    default:
      return 'Gemini non ha risposto. Riprova tra poco.';
  }
}

/** Le chiavi di Google AI Studio iniziano con "AQ." (nuove, da maggio 2026) o "AIza" (vecchie). */
export function looksLikeGeminiKey(key: string): boolean {
  const k = key.trim();
  return /^AIza[0-9A-Za-z_-]{30,}$/.test(k) || /^AQ\.[0-9A-Za-z_.-]{20,}$/.test(k);
}
