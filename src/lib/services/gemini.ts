// Analisi del piatto con Google Gemini (chiave personale dell'utente, presa da Google AI Studio).
// Nell'app Android la richiesta parte dal telefono con CapacitorHttp.
import { CapacitorHttp } from '@capacitor/core';
import { buildPrompt, geminiProblem, geminiText, parseAiMeal, problemMessage, type AiMeal } from '../logic/ai';
import { UserError } from '../errors';
import { isNative } from '../platform';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** In ordine: si passa al successivo se il modello non c'è o ha finito il limite gratuito. */
const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const TIMEOUT_MS = 60_000;

interface HttpResult {
  status: number;
  data: unknown;
}

async function request(method: 'GET' | 'POST', url: string, key: string, body?: unknown): Promise<HttpResult> {
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
        readTimeout: TIMEOUT_MS,
        responseType: 'json',
      });
      return { status: res.status, data: typeof res.data === 'string' ? safeJson(res.data) : res.data };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      return { status: res.status, data: safeJson(await res.text()) };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    if (e instanceof UserError) throw e;
    throw new UserError('Non riesco a contattare Gemini. Controlla la connessione e riprova.');
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function body(prompt: string, image: { base64: string; mime: string } | null, withThinking: boolean): unknown {
  const parts: unknown[] = [];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.base64 } });
  parts.push({ text: prompt });
  const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json' };
  // Ragionamento breve: la risposta arriva prima e consuma meno del limite gratuito.
  if (withThinking) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  return { contents: [{ role: 'user', parts }], generationConfig };
}

/** Stima ingredienti e valori del piatto. Lancia UserError con un messaggio comprensibile. */
export async function analyzeMeal(key: string, description: string, image: { base64: string; mime: string } | null): Promise<AiMeal> {
  const prompt = buildPrompt(description, image !== null);
  let lastProblem: ReturnType<typeof geminiProblem> = 'other';
  for (const [i, model] of MODELS.entries()) {
    const isLast = i === MODELS.length - 1;
    const url = `${BASE}/models/${model}:generateContent`;
    let res = await request('POST', url, key, body(prompt, image, true));
    // Alcuni modelli non accettano l'impostazione del ragionamento: si riprova senza.
    if (res.status === 400 && geminiProblem(res.status, res.data) === 'other') {
      res = await request('POST', url, key, body(prompt, image, false));
    }
    if (res.status >= 200 && res.status < 300) {
      const text = geminiText(res.data);
      const problem = geminiProblem(res.status, res.data);
      if (!text && problem === 'blocked') throw new UserError(problemMessage('blocked'));
      const meal = parseAiMeal(text);
      if (!meal) {
        if (!isLast) continue;
        throw new UserError('Non ho capito la risposta di Gemini. Riprova, magari aggiungendo una descrizione.');
      }
      return meal;
    }
    lastProblem = geminiProblem(res.status, res.data);
    const tryNext = lastProblem === 'model' || lastProblem === 'quota' || res.status >= 500;
    if (!tryNext || isLast) throw new UserError(problemMessage(lastProblem));
  }
  throw new UserError(problemMessage(lastProblem));
}

export type KeyCheck = 'ok' | 'invalid' | 'error';

/**
 * Controlla che la chiave funzioni con una richiesta minuscola al modello più leggero
 * (le chiavi nuove "AQ." non sempre possono leggere l'elenco dei modelli).
 */
export async function checkKey(key: string): Promise<KeyCheck> {
  const model = MODELS[MODELS.length - 1];
  const res = await request('POST', `${BASE}/models/${model}:generateContent`, key, {
    contents: [{ role: 'user', parts: [{ text: 'Rispondi solo: ok' }] }],
    generationConfig: { maxOutputTokens: 5 },
  });
  if (res.status >= 200 && res.status < 300) return 'ok';
  const problem = geminiProblem(res.status, res.data);
  if (problem === 'key') return 'invalid';
  if (problem === 'region') throw new UserError(problemMessage('region'));
  // Limite raggiunto o modello non disponibile: la chiave in sé va bene.
  return problem === 'quota' ? 'ok' : 'error';
}
