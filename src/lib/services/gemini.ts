// Analisi del piatto con Google Gemini (chiave personale dell'utente, presa da Google AI Studio).
// La richiesta parte dal telefono: prima con il fetch della WebView, di riserva con CapacitorHttp.
import { CapacitorHttp } from '@capacitor/core';
import { db } from '../db';
import {
  buildPrompt,
  describeAttempts,
  estimateKey,
  finishNote,
  findCached,
  geminiProblem,
  geminiText,
  isTimeoutError,
  chooseModels,
  isLiteId,
  isPaidOnly,
  LATEST_ALIASES,
  MEAL_SCHEMA,
  PAID_RECHECK_MS,
  parseAiMeal,
  rankModels,
  OVERALL_MS,
  pauseUntil,
  problemMessage,
  raceStep,
  RETRY_MIN_LEFT_MS,
  sanitizeCache,
  withCached,
  SLOW_FOR_MS,
  wasSlow,
  thinkingLevelFor,
  type AiAttempt,
  type AiMeal,
  type AttemptOutcome,
  type GeminiProblem,
  type ListedModel,
  type ModelCandidate,
  type ModelPauses,
  type PromptContext,
  type RaceKind,
  type SlowModels,
} from '../logic/ai';
import { UserError } from '../errors';
import { isNative } from '../platform';
import { getModelPauses, setModelPauses } from '../repo';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
/**
 * Dal migliore al più leggero. Si usa sempre il migliore disponibile: uno che ha finito il limite
 * gratuito resta in pausa fino a quando Google lo azzera, poi torna a essere il primo.
 * Sono solo la riserva: di solito i modelli arrivano dall'elenco di Google (vedi `modelsFor`), così quando
 * esce un Flash nuovo l'app lo usa da sola, senza aggiornamenti.
 */
const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
/** Modelli scelti dall'elenco di Google, riletto una volta al giorno. */
const MODELS_KEY = 'aiModels';
const MODELS_REFRESH_MS = 24 * 60 * 60 * 1000;
/** Cambia quando cambia il modo di scegliere: le scelte salvate prima si rifanno. */
const MODELS_FORMAT = 2;
/** Quanti modelli tenere di riserva (oltre a quelli della gara) per quando i primi finiscono il limite. */
const KEEP_MAIN = 4;
const KEEP_LITE = 2;

/** Esito della prova di un modello con la chiave dell'utente: gratuito o no. */
interface FreeCheck {
  free: boolean;
  at: number;
}

export interface ModelInfo {
  /** Dal migliore al più leggero, senza quelli non gratuiti. */
  models: string[];
  /** Quali sono della famiglia leggera (Flash-Lite). */
  lite: string[];
  /** Non gratuiti con questa chiave (non usati). */
  paid: string[];
  /** Vero se arrivano dall'elenco di Google; falso se è l'elenco scritto nell'app. */
  fromList: boolean;
  at: number;
  checks: Record<string, FreeCheck>;
  format: number;
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((m) => typeof m === 'string');

async function savedModelInfo(): Promise<ModelInfo | null> {
  const v = (await db.kv.get(MODELS_KEY).catch(() => undefined))?.value as Partial<ModelInfo> | undefined;
  if (!v || v.format !== MODELS_FORMAT || !isStrings(v.models) || !v.models.length || !isStrings(v.lite) || !isStrings(v.paid)) return null;
  if (typeof v.at !== 'number' || typeof v.checks !== 'object' || v.checks === null) return null;
  return { models: v.models, lite: v.lite, paid: v.paid, fromList: v.fromList === true, at: v.at, checks: v.checks, format: MODELS_FORMAT };
}

/**
 * Prova minuscola per sapere se un modello è gratuito con questa chiave: vero se risponde, falso se Google
 * dice che non è nel livello gratuito (limite 0, non consuma niente), null se non si capisce (limite del
 * giorno finito, rete, errore): in quel caso lo si tiene e lo si riprova un'altra volta.
 */
async function isFreeModel(key: string, model: string): Promise<boolean | null> {
  try {
    const res = await request(
      'POST',
      `${BASE}/models/${model}:generateContent`,
      key,
      { contents: [{ role: 'user', parts: [{ text: 'Rispondi solo: ok' }] }], generationConfig: { maxOutputTokens: 32 } },
      15_000,
    );
    if (res.status >= 200 && res.status < 300) return true;
    if (res.status === 429 && isPaidOnly(res.data)) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Prova i modelli nuovi dal migliore, solo finché ne servono (2 normali e 1 leggero gratuiti): costa al
 * massimo una richiesta per ogni modello nuovo, una volta sola. Quelli non gratuiti si riprovano dopo un mese.
 */
async function checkNewModels(key: string, candidates: readonly ModelCandidate[], checks: Record<string, FreeCheck>): Promise<void> {
  const now = Date.now();
  for (const [lite, want] of [[false, 2], [true, 1]] as const) {
    let usable = 0;
    for (const c of candidates.filter((m) => m.lite === lite)) {
      if (usable >= want) break;
      const known = checks[c.id];
      if (!known || (!known.free && now - known.at >= PAID_RECHECK_MS)) {
        const free = await isFreeModel(key, c.id);
        if (free !== null) checks[c.id] = { free, at: now };
      }
      if (checks[c.id]?.free !== false) usable++;
    }
  }
}

let loading: Promise<ModelInfo> | null = null;

/**
 * I modelli da usare. Una volta al giorno (o subito se un modello è sparito) si chiede a Google l'elenco
 * dei modelli: funziona anche con la chiave gratuita e non consuma il limite delle stime. Si scelgono per
 * numero di versione, non per nome, così arrivano da soli anche i modelli con nomi nuovi ("4 Hydrogen");
 * i nuovi si provano una volta per sapere se sono gratuiti.
 * Se l'elenco non arriva si tiene quello dell'ultima volta, altrimenti quelli scritti nell'app più i nomi
 * "sempre aggiornati" di Google.
 */
export function modelsFor(key: string, force = false): Promise<ModelInfo> {
  loading ??= loadModels(key, force).finally(() => (loading = null));
  return loading;
}

async function loadModels(key: string, force: boolean): Promise<ModelInfo> {
  const saved = await savedModelInfo();
  if (saved && !force && Date.now() - saved.at < MODELS_REFRESH_MS) return saved;
  let listed: ListedModel[] | null = null;
  try {
    const res = await request('GET', `${BASE}/models?pageSize=1000`, key, undefined, 15_000);
    const models = (res.data as { models?: unknown } | null)?.models;
    if (res.status >= 200 && res.status < 300 && Array.isArray(models)) listed = models as ListedModel[];
  } catch {
    listed = null;
  }
  if (!listed && saved) return saved;
  const ranked = listed ? rankModels(listed) : [];
  const checks: Record<string, FreeCheck> = {};
  for (const c of ranked) if (saved?.checks[c.id]) checks[c.id] = saved.checks[c.id]!;
  if (ranked.length) await checkNewModels(key, ranked, checks);
  const paid = ranked.filter((c) => checks[c.id]?.free === false).map((c) => c.id);
  const usable = ranked.filter((c) => !paid.includes(c.id));
  const fromList = usable.length > 0;
  const chosen: ModelCandidate[] = fromList
    ? [...usable.filter((c) => !c.lite).slice(0, KEEP_MAIN), ...usable.filter((c) => c.lite).slice(0, KEEP_LITE)]
    : [...MODELS, ...LATEST_ALIASES].map((id) => ({ id, lite: isLiteId(id) }));
  const info: ModelInfo = {
    models: chosen.map((c) => c.id),
    lite: chosen.filter((c) => c.lite).map((c) => c.id),
    paid,
    fromList,
    at: Date.now(),
    checks,
    format: MODELS_FORMAT,
  };
  await db.kv.put({ key: MODELS_KEY, value: info }).catch(() => undefined);
  return info;
}

/** I modelli che userebbe adesso una stima (senza quelli in pausa) e quelli non gratuiti: per il Profilo. */
export async function modelsInUse(key: string): Promise<{ models: string[]; paid: string[]; fromList: boolean }> {
  const info = await modelsFor(key);
  const pauses: ModelPauses = await getModelPauses(db).catch(() => ({}));
  return { models: chooseModels(info.models, info.lite, pauses, Date.now()), paid: info.paid, fromList: info.fromList };
}

/** Un modello è sparito: alla prossima stima si rilegge l'elenco (tenendo le prove già fatte). */
async function expireModels(): Promise<void> {
  const saved = await savedModelInfo();
  if (saved) await db.kv.put({ key: MODELS_KEY, value: { ...saved, at: 0 } }).catch(() => undefined);
}
/** Tempo massimo per la richiesta "completa" (vedi `body`): se Gemini si blocca non si aspetta oltre. */
const FULL_TIMEOUT_MS = 30_000;
/** Tempo massimo per le altre richieste. */
const TIMEOUT_MS = 45_000;
/** Dopo un blocco della richiesta completa, per un giorno si usa subito quella leggera. */
const LIGHT_KEY = 'aiLightUntil';
const LIGHT_FOR_MS = 24 * 60 * 60 * 1000;
/** Modelli lenti (vedi `SlowModels`): con le foto e con la sola descrizione si tengono separati. */
const SLOW_KEY = 'aiSlowWithPhoto';
const SLOW_TEXT_KEY = 'aiSlowText';
/** Ultime stime fatte (vedi `CachedEstimate`). */
const CACHE_KEY = 'aiEstimates';
/**
 * Seme fisso: Gemini sceglie le parole con una parte di caso; con lo stesso seme la stessa richiesta
 * dà (quasi sempre) la stessa risposta, quindi grammi e calorie oscillano molto meno.
 */
const SEED = 20261112;

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

async function request(
  method: 'GET' | 'POST',
  url: string,
  key: string,
  body?: unknown,
  timeoutMs = TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<HttpResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new UserError('Sei offline: collegati a internet e riprova.');
  }
  const headers: Record<string, string> = { 'x-goog-api-key': key, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // Prima il fetch della WebView (Gemini accetta richieste dal browser): con una foto il ponte nativo di
  // CapacitorHttp era lentissimo (nessuna risposta in tempo da tutti i modelli). Il ponte resta di riserva.
  try {
    return await viaFetch(method, url, headers, body, timeoutMs, signal);
  } catch (e) {
    if (e instanceof UserError) throw e;
    if (isTimeoutError(e) || !isNative() || signal?.aborted) throw new NetProblem(isTimeoutError(e) ? 'timeout' : 'network');
  }
  try {
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
  } catch (e) {
    throw new NetProblem(isTimeoutError(e) ? 'timeout' : 'network');
  }
}

async function viaFetch(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<HttpResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Quando un altro modello ha già risposto, la richiesta si interrompe.
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop);
  try {
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
    return { status: res.status, data: safeJson(await res.text()) };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
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

function body(prompt: string, image: { base64: string; mime: string } | null, mode: Mode, model: string): unknown {
  const parts: unknown[] = [];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.base64 } });
  parts.push({ text: prompt });
  const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json', seed: SEED };
  if (mode !== 'bare') generationConfig.thinkingConfig = { thinkingLevel: thinkingLevelFor(model) };
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

async function getSlowModels(key: string): Promise<SlowModels> {
  const row = await db.kv.get(key).catch(() => undefined);
  const v = row?.value;
  const out: SlowModels = {};
  if (typeof v === 'object' && v !== null) {
    for (const [k, until] of Object.entries(v as Record<string, unknown>)) if (typeof until === 'number' && until > Date.now()) out[k] = until;
  }
  return out;
}

function saveSlowModels(key: string, slow: SlowModels): void {
  void db.kv.put({ key, value: slow }).catch(() => undefined);
}

/** Come è finita la richiesta a un modello. */
type ModelResult = (
  | { kind: 'ok' | 'empty'; meal: AiMeal; outcome: AttemptOutcome }
  | { kind: 'fail' | 'stop'; outcome: AttemptOutcome; problem: GeminiProblem; unreadable?: boolean }
) & { note?: string };

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
  /** Stessa foto e stessa descrizione di una stima già fatta: ridata uguale, senza chiedere a Gemini. */
  cached?: boolean;
}

export interface AnalyzeOptions {
  /** Chiedere comunque una stima nuova anche se la stessa foto è già stata stimata. */
  fresh?: boolean;
}

/** Stima del piatto: la stessa foto con la stessa descrizione dà sempre la stessa stima (vedi `estimateMeal`). */
export async function analyzeMeal(
  key: string,
  description: string,
  image: { base64: string; mime: string } | null,
  context: PromptContext = {},
  options: AnalyzeOptions = {},
): Promise<AiAnalysis> {
  const now = Date.now();
  const cacheKey = estimateKey(image?.base64 ?? null, description, context.habits ?? []);
  const row = await db.kv.get(CACHE_KEY).catch(() => undefined);
  const cache = sanitizeCache(row?.value, now);
  const hit = options.fresh ? null : findCached(cache, cacheKey);
  if (hit) return { meal: hit.meal, model: hit.model, detail: '', cached: true };
  const result = await estimateMeal(key, description, image, context);
  if (result.meal.items.length) {
    const next = withCached(cache, { key: cacheKey, at: now, model: result.model, meal: result.meal });
    void db.kv.put({ key: CACHE_KEY, value: next }).catch(() => undefined);
  }
  return result;
}

/**
 * Stima ingredienti e valori del piatto, dal modello migliore disponibile in giù.
 * Se un modello non riconosce niente (items vuoti) si prova il successivo; se nessuno riconosce niente
 * si restituisce il risultato vuoto (l'app chiede di descrivere il piatto). Lancia AiError se nessuno risponde.
 */
async function estimateMeal(
  key: string,
  description: string,
  image: { base64: string; mime: string } | null,
  context: PromptContext,
): Promise<AiAnalysis> {
  const prompt = buildPrompt(description, image !== null, context);
  const pauses: ModelPauses = await getModelPauses(db).catch(() => ({}));
  const info = await modelsFor(key);
  const models = chooseModels(info.models, info.lite, pauses, Date.now());
  const slowKey = image ? SLOW_KEY : SLOW_TEXT_KEY;
  const slow = await getSlowModels(slowKey);
  const mode: Mode = (await lightPreferred()) ? 'light' : 'full';
  const savePauses = () => void setModelPauses(db, pauses).catch(() => undefined);
  const t0 = Date.now();
  const deadline = t0 + OVERALL_MS;

  /** Una richiesta a un modello, con i ripieghi (formato più semplice se non accetta le impostazioni). */
  async function runModel(model: string, signal: AbortSignal): Promise<ModelResult> {
    const url = `${BASE}/models/${model}:generateContent`;
    const limit = () => Math.max(1000, Math.min(mode === 'full' ? FULL_TIMEOUT_MS : TIMEOUT_MS, deadline - Date.now()));
    let res: HttpResult;
    const notes: string[] = [];
    try {
      let used: Mode = mode;
      res = await request('POST', url, key, body(prompt, image, used, model), limit(), signal);
      // Il modello non accetta qualche impostazione (errore 400): si toglie prima la forma imposta della
      // risposta e solo dopo il ragionamento. Senza ragionamento indicato i modelli nuovi ragionano "alto",
      // che è lentissimo: per questo non si salta subito al formato più semplice.
      for (const simpler of mode === 'full' ? (['light', 'bare'] as const) : mode === 'light' ? (['bare'] as const) : []) {
        if (!(res.status === 400 && geminiProblem(res.status, res.data) === 'other') || signal.aborted) break;
        used = simpler;
        res = await request('POST', url, key, body(prompt, image, used, model), limit(), signal);
      }
      if (used !== mode) notes.push(used === 'bare' ? 'formato semplice' : 'senza schema');
      // Errore momentaneo dei server di Google (500, 503 "sovraccarico"): si riprova una volta lo stesso modello.
      if (res.status >= 500 && deadline - Date.now() > 10_000 && !signal.aborted) {
        notes.push(`riprovato dopo errore ${res.status}`);
        await new Promise((r) => setTimeout(r, 1500));
        res = await request('POST', url, key, body(prompt, image, used, model), limit(), signal);
      }
    } catch (e) {
      if (!(e instanceof NetProblem)) throw e;
      // Il formato completo a volte fa bloccare Gemini: per un giorno si chiede in modo leggero.
      if (e.kind === 'timeout' && mode === 'full' && !signal.aborted) preferLight();
      const note = notes.join(', ') || undefined;
      return e.kind === 'network'
        ? { kind: 'stop', outcome: 'network', problem: 'network', note }
        : { kind: 'fail', outcome: 'timeout', problem: 'timeout', note };
    }
    if (res.status < 200 || res.status >= 300) {
      const problem = geminiProblem(res.status, res.data);
      const until = pauseUntil(res.status, res.data, Date.now());
      if (until !== null) {
        pauses[model] = until;
        savePauses();
      }
      const outcome: AttemptOutcome =
        problem === 'quota' ? (isPaidOnly(res.data) ? 'paid' : 'quota') : problem === 'model' ? 'model' : 'error';
      // Chiave sbagliata, zona non servita, contenuto bloccato: inutile provare altri modelli.
      const stop = problem === 'key' || problem === 'region' || problem === 'blocked';
      if (outcome === 'error') notes.push(String(res.status));
      return { kind: stop ? 'stop' : 'fail', outcome, problem, note: notes.join(', ') || undefined };
    }
    if (pauses[model]) {
      delete pauses[model];
      savePauses();
    }
    const finish = finishNote(res.data);
    if (finish) notes.push(finish);
    const note = notes.join(', ') || undefined;
    const text = geminiText(res.data);
    if (!text && geminiProblem(res.status, res.data) === 'blocked') return { kind: 'stop', outcome: 'error', problem: 'blocked', note };
    const meal = parseAiMeal(text);
    if (!meal) return { kind: 'fail', outcome: 'unreadable', problem: 'other', unreadable: true, note };
    if (!meal.items.length) return { kind: 'empty', meal, outcome: 'empty', note };
    return { kind: 'ok', meal, outcome: 'ok', note };
  }

  // Gara a scaglioni (regole in `raceStep`): si parte dal migliore e, se tarda, si avvia anche il successivo.
  const runs: { model: string; ctrl: AbortController; result: ModelResult | null; startedAt: number; doneAt: number }[] = [];
  // I modelli da avviare nell'ordine; in fondo si può aggiungere un secondo tentativo del più veloce.
  const queue = [...models];
  let retried = false;
  let firstOkAt: number | null = null;
  let wake: () => void = () => undefined;
  const start = () => {
    const model = queue[runs.length]!;
    const run = { model, ctrl: new AbortController(), result: null as ModelResult | null, startedAt: Date.now(), doneAt: 0 };
    runs.push(run);
    void runModel(model, run.ctrl.signal)
      .catch((e: unknown): ModelResult => ({ kind: 'stop', outcome: 'error', problem: e instanceof UserError ? 'network' : 'other' }))
      .then((r) => {
        run.result = r;
        run.doneAt = Date.now();
        if (r.kind === 'ok' && firstOkAt === null) firstOkAt = Date.now();
        wake();
      });
  };

  let outcome: { type: 'use' | 'stop'; index: number } | { type: 'finish' };
  for (;;) {
    const now = Date.now();
    const last = runs[runs.length - 1];
    const step = raceStep({
      results: runs.map((r): RaceKind | null => r.result?.kind ?? null),
      total: queue.length,
      lastIsSlow: last !== undefined && last.model in slow,
      sinceLastStart: last ? now - last.startedAt : 0,
      sinceFirstOk: firstOkAt === null ? null : now - firstOkAt,
      elapsed: now - t0,
    });
    if (step.type === 'start') {
      start();
      continue;
    }
    if (step.type === 'wait') {
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, 500);
      });
      continue;
    }
    // Nessuno ha risposto in tempo ma c'è ancora tempo: si riprova una volta il più veloce
    // (una risposta lenta spesso è un intoppo momentaneo, la seconda volta va).
    if (step.type === 'finish' && !retried && queue.length && now - t0 <= OVERALL_MS - RETRY_MIN_LEFT_MS && runs.some((r) => r.result?.outcome === 'timeout')) {
      retried = true;
      queue.push(queue[queue.length - 1]!);
      continue;
    }
    outcome = step;
    break;
  }

  // Le richieste ancora in corso non servono più.
  for (const r of runs) if (!r.result) r.ctrl.abort();
  // Un modello è sparito (Google l'ha spento): la prossima volta si rilegge subito l'elenco.
  if (runs.some((r) => r.result?.outcome === 'model')) void expireModels().catch(() => undefined);

  // Chi non ha risposto per almeno 20 s parte senza vantaggio per un giorno (foto e sola descrizione tenute
  // separate); chi ha risposto bene lo riprende.
  {
    let changed = false;
    for (const r of runs) {
      if (wasSlow(r.result?.outcome ?? null, (r.result ? r.doneAt : Date.now()) - r.startedAt)) {
        slow[r.model] = Date.now() + SLOW_FOR_MS;
        changed = true;
      } else if (r.result?.kind === 'ok' && r.model in slow) {
        delete slow[r.model];
        changed = true;
      }
    }
    if (changed) saveSlowModels(slowKey, slow);
  }

  const stoppedAt = Date.now();
  const attempts: AiAttempt[] = runs.map((r) => ({
    model: r.model,
    outcome: r.result?.outcome ?? (outcome.type === 'use' ? 'slower' : 'timeout'),
    // Anche per chi è stato fermato: quanto lo si è aspettato.
    seconds: Math.round(((r.result ? r.doneAt : stoppedAt) - t0) / 1000),
    ...(r.result?.note ? { note: r.result.note } : {}),
  }));
  const detail = describeAttempts(attempts);
  if (outcome.type === 'use') {
    const r = runs[outcome.index]!.result as { meal: AiMeal };
    return { meal: r.meal, model: runs[outcome.index]!.model, detail: attempts.length > 1 ? detail : '' };
  }
  if (outcome.type === 'stop') {
    const r = runs[outcome.index]!.result as { problem: GeminiProblem };
    throw new AiError(problemMessage(r.problem), detail);
  }
  const empty = runs.find((r) => r.result?.kind === 'empty');
  if (empty?.result && 'meal' in empty.result) return { meal: empty.result.meal, model: empty.model, detail };
  const results = runs.map((r) => r.result);
  if (results.some((r) => r && 'unreadable' in r && r.unreadable)) {
    throw new AiError('Gemini ha risposto in modo incompleto. Riprova: di solito la seconda volta va.', detail);
  }
  // Il problema più utile da dire: un limite o un modello mancante prima di "non ha risposto in tempo".
  const problems = results.map((r) => (r && 'problem' in r ? r.problem : 'timeout'));
  const lastProblem: GeminiProblem = problems.includes('timeout') ? 'timeout' : (problems[problems.length - 1] ?? 'other');
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
