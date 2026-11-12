// Analisi del piatto con Google Gemini (chiave personale dell'utente, presa da Google AI Studio).
// Nell'app Android la richiesta parte dal telefono con CapacitorHttp.
import { CapacitorHttp } from '@capacitor/core';
import { db } from '../db';
import {
  buildPrompt,
  describeAttempts,
  geminiProblem,
  geminiText,
  isTimeoutError,
  MEAL_SCHEMA,
  modelsToTry,
  parseAiMeal,
  pauseUntil,
  problemMessage,
  type AiAttempt,
  type AiMeal,
  type GeminiProblem,
  type ModelPauses,
  type PromptContext,
} from '../logic/ai';
import { UserError } from '../errors';
import { isNative } from '../platform';
import { getModelPauses, setModelPauses } from '../repo';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
/**
 * Dal migliore al più leggero. Si usa sempre il migliore disponibile: uno che ha finito il limite
 * gratuito resta in pausa fino a quando Google lo azzera, poi torna a essere il primo.
 */
const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
/** Tempo massimo per la richiesta "completa" (vedi `body`): se Gemini si blocca non si aspetta oltre. */
const FULL_TIMEOUT_MS = 30_000;
/** Tempo massimo per le altre richieste. */
const TIMEOUT_MS = 45_000;
/** Dopo un blocco della richiesta completa, per un giorno si usa subito quella leggera. */
const LIGHT_KEY = 'aiLightUntil';
const LIGHT_FOR_MS = 24 * 60 * 60 * 1000;

/** La richiesta non è arrivata a Gemini (rete) o Gemini non ha risposto in tempo. */
class NetProblem extends Error {
  constructor(readonly kind: 'timeout' | 'network') {
    super(kind);
  }
}

interface HttpResult {
  status: number;
  data: unknown;
}

async function request(method: 'GET' | 'POST', url: string, key: string, body?: unknown, timeoutMs = TIMEOUT_MS): Promise<HttpResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new UserError('Sei offline: collegati a internet e riprova.');
  }
  const headers: Record<string, string> = { 'x-goog-api-key': key, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    if (isNative()) {
      const res = await CapacitorHttp.request({
        method,
        url,
        headers,
        data: body,
        connectTimeout: 15_000,
        readTimeout: timeoutMs,
        responseType: 'json',
      });
      return { status: res.status, data: typeof res.data === 'string' ? safeJson(res.data) : res.data };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      return { status: res.status, data: safeJson(await res.text()) };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    if (e instanceof UserError) throw e;
    throw new NetProblem(isTimeoutError(e) ? 'timeout' : 'network');
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Tre modi di chiedere, dal più preciso al più semplice (il prompt descrive comunque il JSON):
 * - `full`: ragionamento breve e forma della risposta imposta (JSON sempre valido). A volte però Gemini
 *   resta bloccato senza rispondere quando riceve tutte e due le cose insieme, soprattutto con una foto;
 * - `light`: solo il ragionamento breve;
 * - `bare`: niente impostazioni, per i modelli che non le accettano.
 */
type Mode = 'full' | 'light' | 'bare';

function body(prompt: string, image: { base64: string; mime: string } | null, mode: Mode): unknown {
  const parts: unknown[] = [];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.base64 } });
  parts.push({ text: prompt });
  const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json' };
  if (mode !== 'bare') generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  if (mode === 'full') generationConfig.responseJsonSchema = MEAL_SCHEMA;
  return { contents: [{ role: 'user', parts }], generationConfig };
}

async function lightPreferred(): Promise<boolean> {
  const row = await db.kv.get(LIGHT_KEY).catch(() => undefined);
  return typeof row?.value === 'number' && row.value > Date.now();
}

function preferLight(): void {
  void db.kv.put({ key: LIGHT_KEY, value: Date.now() + LIGHT_FOR_MS }).catch(() => undefined);
}

/** Errore della Foto AI con, in più, una riga tecnica breve su cosa è successo con ogni modello. */
export class AiError extends UserError {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
  }
}

export interface AiAnalysis {
  meal: AiMeal;
  /** Il modello che ha risposto. */
  model: string;
  /** Riga tecnica sui tentativi (vuota se il primo modello ha risposto subito). */
  detail: string;
}

/**
 * Stima ingredienti e valori del piatto, dal modello migliore disponibile in giù.
 * Se un modello non riconosce niente (items vuoti) si prova il successivo; se nessuno riconosce niente
 * si restituisce il risultato vuoto (l'app chiede di descrivere il piatto). Lancia AiError se nessuno risponde.
 */
export async function analyzeMeal(
  key: string,
  description: string,
  image: { base64: string; mime: string } | null,
  context: PromptContext = {},
): Promise<AiAnalysis> {
  const prompt = buildPrompt(description, image !== null, context);
  const pauses: ModelPauses = await getModelPauses(db).catch(() => ({}));
  const models = modelsToTry(MODELS, pauses, Date.now());
  const attempts: AiAttempt[] = [];
  let empty: { meal: AiMeal; model: string } | null = null;
  let lastProblem: GeminiProblem = 'other';
  let mode: Mode = (await lightPreferred()) ? 'light' : 'full';
  const savePauses = () => void setModelPauses(db, pauses).catch(() => undefined);

  for (const model of models) {
    const url = `${BASE}/models/${model}:generateContent`;
    let res: HttpResult;
    try {
      res = await request('POST', url, key, body(prompt, image, mode), mode === 'full' ? FULL_TIMEOUT_MS : TIMEOUT_MS);
      if (res.status === 400 && geminiProblem(res.status, res.data) === 'other') {
        res = await request('POST', url, key, body(prompt, image, 'bare'));
      }
    } catch (e) {
      if (!(e instanceof NetProblem)) throw e;
      attempts.push({ model, outcome: e.kind });
      lastProblem = e.kind;
      // Senza rete è inutile provare gli altri modelli.
      if (e.kind === 'network') break;
      // Nessuna risposta: si passa al modello successivo e da qui in poi si chiede in modo leggero,
      // che non si blocca (e per un giorno si parte già così).
      if (mode === 'full') {
        mode = 'light';
        preferLight();
      }
      continue;
    }

    if (res.status < 200 || res.status >= 300) {
      lastProblem = geminiProblem(res.status, res.data);
      const until = pauseUntil(res.status, res.data, Date.now());
      if (until !== null) {
        pauses[model] = until;
        savePauses();
      }
      attempts.push({ model, outcome: lastProblem === 'quota' ? 'quota' : lastProblem === 'model' ? 'model' : 'error' });
      // Chiave sbagliata, zona non servita, contenuto bloccato: inutile provare altri modelli.
      if (lastProblem === 'key' || lastProblem === 'region' || lastProblem === 'blocked') break;
      continue;
    }

    if (pauses[model]) {
      delete pauses[model];
      savePauses();
    }
    const text = geminiText(res.data);
    if (!text && geminiProblem(res.status, res.data) === 'blocked') {
      lastProblem = 'blocked';
      attempts.push({ model, outcome: 'error' });
      break;
    }
    const meal = parseAiMeal(text);
    if (!meal) {
      attempts.push({ model, outcome: 'unreadable' });
      continue;
    }
    if (!meal.items.length) {
      attempts.push({ model, outcome: 'empty' });
      empty ??= { meal, model };
      continue;
    }
    attempts.push({ model, outcome: 'ok' });
    return { meal, model, detail: attempts.length > 1 ? describeAttempts(attempts) : '' };
  }

  const detail = describeAttempts(attempts);
  if (empty) return { ...empty, detail };
  if (attempts.some((a) => a.outcome === 'unreadable') && lastProblem !== 'key' && lastProblem !== 'region' && lastProblem !== 'blocked') {
    throw new AiError('Gemini ha risposto in modo incompleto. Riprova: di solito la seconda volta va.', detail);
  }
  throw new AiError(problemMessage(lastProblem), detail);
}

export type KeyCheck = 'ok' | 'invalid' | 'error';

/**
 * Controlla che la chiave funzioni con una richiesta minuscola al modello più leggero
 * (le chiavi nuove "AQ." non sempre possono leggere l'elenco dei modelli).
 */
export async function checkKey(key: string): Promise<KeyCheck> {
  const model = MODELS[MODELS.length - 1];
  let res: HttpResult;
  try {
    res = await request('POST', `${BASE}/models/${model}:generateContent`, key, {
      contents: [{ role: 'user', parts: [{ text: 'Rispondi solo: ok' }] }],
      generationConfig: { maxOutputTokens: 5 },
    });
  } catch (e) {
    if (e instanceof NetProblem) throw new UserError(problemMessage(e.kind));
    throw e;
  }
  if (res.status >= 200 && res.status < 300) return 'ok';
  const problem = geminiProblem(res.status, res.data);
  if (problem === 'key') return 'invalid';
  if (problem === 'region') throw new UserError(problemMessage('region'));
  // Limite raggiunto o modello non disponibile: la chiave in sé va bene.
  return problem === 'quota' ? 'ok' : 'error';
}
