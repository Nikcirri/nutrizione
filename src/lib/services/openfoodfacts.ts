// Richieste a Open Food Facts. Nell'app Android passano dal telefono (CapacitorHttp),
// così si può mandare lo User-Agent che Open Food Facts chiede e non ci sono blocchi CORS.
import { CapacitorHttp } from '@capacitor/core';
import { OFF_FIELDS, isBarcode, parseProductResponse, parseSearchResponse, type ProductLookup } from '../logic/off';
import { UserError } from '../errors';
import { APP_VERSION, isNative } from '../platform';
import type { Food } from '../types';

const USER_AGENT = `Nutrizione/${APP_VERSION} (https://github.com/Nikcirri/nutrizione)`;
const TIMEOUT_MS = 15_000;

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function getJson(url: string): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new UserError('Sei offline: collegati a internet e riprova.');
  }
  if (isNative()) {
    const res = await CapacitorHttp.get({
      url,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      connectTimeout: TIMEOUT_MS,
      readTimeout: TIMEOUT_MS,
      responseType: 'json',
    });
    if (res.status >= 400) throw new HttpError(res.status);
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (res.status >= 400) throw new HttpError(res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function friendly(e: unknown): Error {
  if (e instanceof UserError) return e;
  if (e instanceof HttpError) {
    if (e.status === 429 || e.status === 503) {
      return new UserError('Open Food Facts è occupato in questo momento: riprova tra un minuto.');
    }
    return new UserError(`Open Food Facts non risponde (errore ${e.status}). Riprova più tardi.`);
  }
  return new UserError('Non riesco a contattare Open Food Facts. Controlla la connessione e riprova.');
}

/** Cerca un prodotto per codice a barre. */
export async function lookupBarcode(code: string): Promise<ProductLookup> {
  const clean = code.trim();
  if (!isBarcode(clean)) return { kind: 'missing' };
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(clean)}.json?fields=${OFF_FIELDS}`;
  try {
    return parseProductResponse(await getJson(url), clean, new Date().toISOString());
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return { kind: 'missing' };
    throw friendly(e);
  }
}

/** Cerca prodotti per nome: prima con il motore nuovo (Search-a-licious), poi con quello classico. */
export async function searchProducts(query: string): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const now = new Date().toISOString();
  const first = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&langs=it,en&page_size=25&fields=${OFF_FIELDS}`;
  let firstError: unknown = null;
  try {
    const found = parseSearchResponse(await getJson(first), now);
    if (found.length) return found;
  } catch (e) {
    if (e instanceof UserError) throw e;
    firstError = e;
  }
  const legacy =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&lc=it&page_size=25&sort_by=unique_scans_n&fields=${OFF_FIELDS}`;
  try {
    return parseSearchResponse(await getJson(legacy), now);
  } catch (e) {
    throw friendly(firstError ?? e);
  }
}
